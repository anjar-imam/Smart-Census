import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.models import FamilyMember, Household, HouseholdHistory, HouseholdManager, Location, User

logger = logging.getLogger("smart_census")


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def deliver_otp(phone: str, code: str) -> None:
    if settings.sms_provider == "console":
        if settings.app_env != "development":
            raise RuntimeError("The console SMS provider is only permitted in development")
        logger.warning("Development OTP for %s: %s", phone, code)
        return
    if settings.sms_provider != "twilio":
        raise RuntimeError(f"Unsupported SMS_PROVIDER: {settings.sms_provider}")
    if not all((settings.twilio_account_sid, settings.twilio_auth_token, settings.twilio_from_number)):
        raise RuntimeError("Configure all Twilio credentials before requesting an OTP")

    url = (
        "https://api.twilio.com/2010-04-01/Accounts/"
        f"{settings.twilio_account_sid}/Messages.json"
    )
    body = urllib.parse.urlencode(
        {"To": phone, "From": settings.twilio_from_number, "Body": f"Your Smart Census sign-in code is {code}."}
    ).encode()
    request = urllib.request.Request(url, data=body)
    import base64

    credentials = f"{settings.twilio_account_sid}:{settings.twilio_auth_token}".encode()
    request.add_header("Authorization", "Basic " + base64.b64encode(credentials).decode())
    request.add_header("Content-Type", "application/x-www-form-urlencoded")
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            if response.status >= 300:
                raise RuntimeError(f"SMS provider returned HTTP {response.status}")
    except (urllib.error.URLError, TimeoutError) as exc:
        logger.exception("Could not deliver OTP")
        raise RuntimeError("SMS delivery failed; please try again") from exc


def audit(
    db: Session,
    household_id: str,
    actor_id: str,
    action: str,
    entity_type: str,
    entity_id: str,
    before: dict | None = None,
    after: dict | None = None,
) -> None:
    db.add(
        HouseholdHistory(
            household_id=household_id,
            actor_id=actor_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            before_data=json.dumps(before, default=str, sort_keys=True) if before is not None else None,
            after_data=json.dumps(after, default=str, sort_keys=True) if after is not None else None,
        )
    )


def member_data(member: FamilyMember) -> dict:
    return {
        "full_name": member.full_name,
        "date_of_birth": member.date_of_birth,
        "age": member.age,
        "gender": member.gender,
        "relationship": member.relationship,
        "education": member.education,
        "occupation": member.occupation,
        "living_status": member.living_status,
        "removed_at": member.removed_at,
    }


def household_data(household: Household) -> dict:
    return {
        "head_name": household.head_name,
        "mobile": household.mobile,
        "address": household.address,
        "location_id": household.location_id,
    }


def get_managed_household(db: Session, household_id: str, user: User) -> Household:
    household = (
        db.query(Household)
        .options(joinedload(Household.location))
        .join(HouseholdManager)
        .filter(Household.id == household_id, HouseholdManager.user_id == user.id)
        .first()
    )
    if household is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Household not found")
    return household


def household_response(db: Session, household: Household) -> dict:
    return {
        "id": household.id,
        "household_code": household.household_code,
        "head_name": household.head_name,
        "mobile": household.mobile,
        "address": household.address,
        "state": household.location.state,
        "district": household.location.district,
        "city_village": household.location.city_village,
        "ward": household.location.ward,
        "locality": household.location.locality,
        "created_at": household.created_at,
        "member_count": (
            db.query(func.count(FamilyMember.id))
            .filter(
                FamilyMember.household_id == household.id,
                FamilyMember.living_status == "active",
                FamilyMember.removed_at.is_(None),
            )
            .scalar()
            or 0
        ),
    }


def upsert_location(db: Session, fields: dict, existing: Location | None = None) -> Location:
    names = ("state", "district", "city_village", "ward", "locality")
    values = {name: fields[name] if fields.get(name) is not None else getattr(existing, name) for name in names}
    location = (
        db.query(Location)
        .filter_by(**values)
        .first()
    )
    if location:
        return location
    location = Location(**values)
    db.add(location)
    db.flush()
    return location


def calculate_age(member: FamilyMember) -> int | None:
    if member.date_of_birth:
        today = date.today()
        return today.year - member.date_of_birth.year - (
            (today.month, today.day) < (member.date_of_birth.month, member.date_of_birth.day)
        )
    return member.age


def age_group(age: int | None) -> str:
    if age is None:
        return "Unknown"
    if age <= 14:
        return "0-14"
    if age <= 24:
        return "15-24"
    if age <= 44:
        return "25-44"
    if age <= 64:
        return "45-64"
    return "65+"


def historical_member_matches(snapshot: dict | None, filters: dict) -> bool:
    if not snapshot or snapshot.get("living_status") != "active" or snapshot.get("removed_at") is not None:
        return False
    if filters.get("gender") and snapshot.get("gender") != filters["gender"]:
        return False
    birth_date = snapshot.get("date_of_birth")
    age = snapshot.get("age")
    if birth_date:
        born = date.fromisoformat(birth_date)
        today = date.today()
        age = today.year - born.year - ((today.month, today.day) < (born.month, born.day))
    if filters.get("age_group") and age_group(age) != filters["age_group"]:
        return False
    return True


def recent_months(now: datetime) -> list[str]:
    year, month = now.year, now.month
    months = []
    for _ in range(6):
        months.append(f"{year:04d}-{month:02d}")
        month -= 1
        if month == 0:
            year -= 1
            month = 12
    return list(reversed(months))


def analytics(db: Session, filters: dict) -> dict:
    query = db.query(Household).join(Location)
    for field in ("state", "district", "city_village", "ward", "locality"):
        if filters.get(field):
            query = query.filter(getattr(Location, field) == filters[field])
    households = query.options(joinedload(Household.location)).all()
    household_ids = [household.id for household in households]
    members = []
    if household_ids:
        members = (
            db.query(FamilyMember)
            .filter(
                FamilyMember.household_id.in_(household_ids),
                FamilyMember.living_status == "active",
                FamilyMember.removed_at.is_(None),
            )
            .all()
        )

    if filters.get("gender"):
        members = [member for member in members if member.gender == filters["gender"]]
    if filters.get("age_group"):
        members = [member for member in members if age_group(calculate_age(member)) == filters["age_group"]]

    matching_ids = {member.household_id for member in members}
    population = len(members)
    male = sum(member.gender == "male" for member in members)
    female = sum(member.gender == "female" for member in members)
    other = population - male - female

    age_counts = {group: 0 for group in ("0-14", "15-24", "25-44", "45-64", "65+", "Unknown")}
    area_counts: dict[str, int] = {}
    member_counts: dict[str, int] = {}
    for member in members:
        age_counts[age_group(calculate_age(member))] += 1
        member_counts[member.household_id] = member_counts.get(member.household_id, 0) + 1
    for household in households:
        area = f"{household.location.city_village} · {household.location.locality}"
        area_counts[area] = area_counts.get(area, 0) + member_counts.get(household.id, 0)

    distribution = {"0": 0, "1": 0, "2-3": 0, "4-5": 0, "6+": 0}
    for household in households:
        size = member_counts.get(household.id, 0)
        key = "0" if size == 0 else "1" if size == 1 else "2-3" if size <= 3 else "4-5" if size <= 5 else "6+"
        distribution[key] += 1

    month_labels = recent_months(datetime.now(timezone.utc))
    deltas: dict[str, int] = {}
    if household_ids:
        history = (
            db.query(HouseholdHistory)
            .filter(
                HouseholdHistory.household_id.in_(household_ids),
                HouseholdHistory.entity_type == "member",
                HouseholdHistory.action.in_(("created", "updated", "removed")),
            )
            .order_by(HouseholdHistory.created_at.asc())
            .all()
        )
        for event in history:
            before = json.loads(event.before_data) if event.before_data else None
            after = json.loads(event.after_data) if event.after_data else None
            delta = int(historical_member_matches(after, filters)) - int(historical_member_matches(before, filters))
            if delta:
                month = event.created_at.strftime("%Y-%m")
                deltas[month] = deltas.get(month, 0) + delta
    baseline = max(0, population - sum(deltas.get(month, 0) for month in month_labels))
    running_population = baseline
    growth = []
    for month in month_labels:
        change = deltas.get(month, 0)
        running_population += change
        growth.append(
            {
                "month": month,
                "registrations": max(0, change),
                "population": max(0, running_population),
                "net_change": change,
            }
        )

    location_ids = {household.location_id for household in households}
    return {
        "total_households": len(households),
        "total_population": population,
        "male_population": male,
        "female_population": female,
        "other_population": other,
        "average_family_size": round(population / len(households), 2) if households else 0,
        "registered_areas": len(location_ids),
        "gender_distribution": [
            {"name": "Male", "value": male},
            {"name": "Female", "value": female},
            {"name": "Other / unspecified", "value": other},
        ],
        "male_female": [{"name": "Male", "value": male}, {"name": "Female", "value": female}],
        "age_distribution": [{"name": key, "value": value} for key, value in age_counts.items()],
        "area_population": [
            {"name": key, "value": value}
            for key, value in sorted(area_counts.items(), key=lambda item: item[1], reverse=True)[:12]
        ],
        "household_size_distribution": [{"name": key, "value": value} for key, value in distribution.items()],
        "population_growth": growth,
        "matching_households": len(matching_ids),
    }
