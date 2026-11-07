import csv
import io
import logging
import secrets
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, update
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.database import Base, engine, get_db
from app.models import FamilyMember, Household, HouseholdHistory, HouseholdManager, Location, OtpChallenge, User
from app.schemas import (
    HouseholdCreate,
    HouseholdResponse,
    HouseholdUpdate,
    HistoryResponse,
    MemberCreate,
    MemberResponse,
    MemberUpdate,
    OtpRequest,
    OtpVerify,
    RoleUpdate,
    TokenResponse,
    UserResponse,
)
from app.security import create_access_token, get_current_user, hash_otp, require_admin
from app.services import (
    analytics,
    audit,
    deliver_otp,
    get_managed_household,
    household_data,
    household_response,
    member_data,
    upsert_location,
    utc_now,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("smart_census")

app = FastAPI(title="Smart Census API", version="1.0.0", description="Independent citizen self-census platform")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def create_database_tables() -> None:
    if settings.app_env == "production" and (
        len(settings.jwt_secret) < 32 or settings.sms_provider == "console"
    ):
        raise RuntimeError("Production requires a strong JWT_SECRET and a real SMS provider")
    Base.metadata.create_all(bind=engine)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/auth/request-otp")
def request_otp(payload: OtpRequest, db: Session = Depends(get_db)) -> dict:
    now = utc_now()
    recent = (
        db.query(func.count(OtpChallenge.id))
        .filter(OtpChallenge.phone == payload.phone, OtpChallenge.created_at >= now - timedelta(minutes=10))
        .scalar()
        or 0
    )
    if recent >= 5:
        raise HTTPException(status_code=429, detail="Too many codes requested. Try again later.")
    code = f"{secrets.randbelow(1_000_000):06d}"
    challenge = OtpChallenge(
        phone=payload.phone,
        code_hash=hash_otp(code),
        expires_at=now + timedelta(minutes=settings.otp_expire_minutes),
    )
    db.add(challenge)
    db.commit()
    try:
        deliver_otp(payload.phone, code)
    except RuntimeError as exc:
        db.delete(challenge)
        db.commit()
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"message": "If the number can receive messages, a sign-in code has been sent.", "expires_in": settings.otp_expire_minutes * 60}


@app.post("/auth/verify-otp", response_model=TokenResponse)
def verify_otp(payload: OtpVerify, db: Session = Depends(get_db)) -> dict:
    challenge = (
        db.query(OtpChallenge)
        .filter(OtpChallenge.phone == payload.phone, OtpChallenge.consumed_at.is_(None))
        .order_by(OtpChallenge.created_at.desc())
        .with_for_update()
        .first()
    )
    if challenge is None or challenge.attempts >= settings.otp_max_attempts:
        raise HTTPException(status_code=400, detail="Code is invalid or expired")
    expires_at = challenge.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= utc_now() or not secrets.compare_digest(challenge.code_hash, hash_otp(payload.code)):
        db.execute(
            update(OtpChallenge)
            .where(OtpChallenge.id == challenge.id, OtpChallenge.consumed_at.is_(None))
            .values(attempts=OtpChallenge.attempts + 1)
        )
        db.commit()
        raise HTTPException(status_code=400, detail="Code is invalid or expired")
    consumed = db.execute(
        update(OtpChallenge)
        .where(
            OtpChallenge.id == challenge.id,
            OtpChallenge.consumed_at.is_(None),
            OtpChallenge.attempts < settings.otp_max_attempts,
        )
        .values(consumed_at=utc_now())
    )
    if consumed.rowcount != 1:
        db.rollback()
        raise HTTPException(status_code=400, detail="Code is invalid or expired")
    user = db.query(User).filter(User.phone == payload.phone).first()
    if user is None:
        user = User(phone=payload.phone)
        db.add(user)
    db.commit()
    db.refresh(user)
    return {"access_token": create_access_token(user), "user": user}


@app.get("/auth/me", response_model=UserResponse)
def current_user(user: User = Depends(get_current_user)) -> User:
    return user


@app.post("/households", response_model=HouseholdResponse, status_code=201)
def create_household(
    payload: HouseholdCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    location = upsert_location(db, payload.model_dump())
    household = Household(
        household_code=f"SC-{datetime.now(timezone.utc):%y%m%d}-{uuid4().hex[:6].upper()}",
        head_name=payload.head_name.strip(),
        mobile=payload.mobile.strip(),
        address=payload.address.strip(),
        location=location,
        created_by=user.id,
        consent_at=utc_now(),
    )
    db.add(household)
    db.flush()
    db.add(HouseholdManager(household_id=household.id, user_id=user.id))
    audit(
        db,
        household.id,
        user.id,
        "created",
        "household",
        household.id,
        after=household_data(household),
    )
    db.commit()
    db.refresh(household)
    return household_response(db, household)


@app.get("/households", response_model=list[HouseholdResponse])
def list_households(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[dict]:
    households = (
        db.query(Household)
        .join(HouseholdManager)
        .options(joinedload(Household.location))
        .filter(HouseholdManager.user_id == user.id)
        .order_by(Household.created_at.desc())
        .all()
    )
    return [household_response(db, household) for household in households]


@app.get("/households/{household_id}", response_model=HouseholdResponse)
def get_household(household_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    household = get_managed_household(db, household_id, user)
    return household_response(db, household)


@app.patch("/households/{household_id}", response_model=HouseholdResponse)
def update_household(
    household_id: str,
    payload: HouseholdUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    household = get_managed_household(db, household_id, user)
    before = household_data(household)
    changes = payload.model_dump(exclude_unset=True, exclude_none=True)
    location_fields = {key: changes.pop(key) for key in ("state", "district", "city_village", "ward", "locality") if key in changes}
    for key, value in changes.items():
        setattr(household, key, value.strip() if isinstance(value, str) else value)
    if location_fields:
        household.location = upsert_location(db, location_fields, household.location)
    audit(db, household.id, user.id, "updated", "household", household.id, before, household_data(household))
    db.commit()
    db.refresh(household)
    return household_response(db, household)


@app.get("/households/{household_id}/members", response_model=list[MemberResponse])
def list_members(
    household_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[FamilyMember]:
    get_managed_household(db, household_id, user)
    return (
        db.query(FamilyMember)
        .filter(FamilyMember.household_id == household_id, FamilyMember.removed_at.is_(None))
        .order_by(FamilyMember.registered_at.asc())
        .all()
    )


@app.post("/households/{household_id}/members", response_model=MemberResponse, status_code=201)
def create_member(
    household_id: str,
    payload: MemberCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FamilyMember:
    get_managed_household(db, household_id, user)
    duplicate_query = db.query(FamilyMember).filter(
        FamilyMember.household_id == household_id,
        func.lower(FamilyMember.full_name) == payload.full_name.strip().lower(),
        FamilyMember.removed_at.is_(None),
    )
    if payload.date_of_birth is not None:
        duplicate_query = duplicate_query.filter(FamilyMember.date_of_birth == payload.date_of_birth)
    else:
        duplicate_query = duplicate_query.filter(FamilyMember.date_of_birth.is_(None))
    if duplicate_query.first():
        raise HTTPException(status_code=409, detail="A family member with the same name and date of birth is already registered")
    member = FamilyMember(household_id=household_id, **payload.model_dump())
    db.add(member)
    db.flush()
    audit(db, household_id, user.id, "created", "member", member.id, after=member_data(member))
    db.commit()
    db.refresh(member)
    return member


@app.patch("/households/{household_id}/members/{member_id}", response_model=MemberResponse)
def update_member(
    household_id: str,
    member_id: str,
    payload: MemberUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FamilyMember:
    get_managed_household(db, household_id, user)
    member = db.query(FamilyMember).filter_by(id=member_id, household_id=household_id, removed_at=None).first()
    if member is None:
        raise HTTPException(status_code=404, detail="Family member not found")
    before = member_data(member)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(member, key, value)
    if member.age is None and member.date_of_birth is None:
        raise HTTPException(status_code=422, detail="A family member must have either an age or date of birth")
    audit(db, household_id, user.id, "updated", "member", member.id, before, member_data(member))
    db.commit()
    db.refresh(member)
    return member


@app.delete("/households/{household_id}/members/{member_id}", status_code=204)
def remove_member(
    household_id: str,
    member_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    get_managed_household(db, household_id, user)
    member = db.query(FamilyMember).filter_by(id=member_id, household_id=household_id, removed_at=None).first()
    if member is None:
        raise HTTPException(status_code=404, detail="Family member not found")
    before = member_data(member)
    member.removed_at = utc_now()
    audit(db, household_id, user.id, "removed", "member", member.id, before, member_data(member))
    db.commit()
    return Response(status_code=204)


@app.get("/households/{household_id}/history", response_model=list[HistoryResponse])
def household_history(
    household_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[HouseholdHistory]:
    get_managed_household(db, household_id, user)
    return (
        db.query(HouseholdHistory)
        .filter(HouseholdHistory.household_id == household_id)
        .order_by(HouseholdHistory.created_at.desc())
        .limit(200)
        .all()
    )


def analytics_filters(
    state: str | None,
    district: str | None,
    city_village: str | None,
    ward: str | None,
    locality: str | None,
    gender: str | None,
    age_group: str | None,
) -> dict:
    return {
        "state": state,
        "district": district,
        "city_village": city_village,
        "ward": ward,
        "locality": locality,
        "gender": gender,
        "age_group": age_group,
    }


@app.get("/public/analytics")
def public_analytics(
    state: str | None = None,
    district: str | None = None,
    city_village: str | None = None,
    ward: str | None = None,
    locality: str | None = None,
    gender: str | None = Query(default=None, pattern="^(male|female|other|prefer_not_to_say)$"),
    age_group: str | None = Query(default=None, pattern="^(0-14|15-24|25-44|45-64|65\\+|Unknown)$"),
    db: Session = Depends(get_db),
) -> dict:
    return analytics(db, analytics_filters(state, district, city_village, ward, locality, gender, age_group))


@app.get("/public/locations")
def public_locations(db: Session = Depends(get_db)) -> dict:
    locations = db.query(Location).order_by(Location.state, Location.district, Location.city_village, Location.ward, Location.locality).all()
    return {
        "states": sorted({location.state for location in locations}),
        "districts": sorted({location.district for location in locations}),
        "cities": sorted({location.city_village for location in locations}),
        "wards": sorted({location.ward for location in locations}),
        "localities": sorted({location.locality for location in locations}),
    }


@app.get("/admin/households")
def admin_households(
    search: str = "",
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
) -> list[dict]:
    query = db.query(Household).join(Location).options(joinedload(Household.location))
    if search.strip():
        pattern = f"%{search.strip()}%"
        query = query.filter(
            (Household.household_code.ilike(pattern))
            | (Household.head_name.ilike(pattern))
            | (Household.mobile.ilike(pattern))
            | (Location.locality.ilike(pattern))
        )
    return [household_response(db, household) for household in query.order_by(Household.created_at.desc()).limit(500).all()]


@app.get("/admin/users", response_model=list[UserResponse])
def admin_users(db: Session = Depends(get_db), _admin: User = Depends(require_admin)) -> list[User]:
    return db.query(User).order_by(User.created_at.desc()).limit(500).all()


@app.patch("/admin/users/{user_id}/role", response_model=UserResponse)
def update_user_role(
    user_id: str,
    payload: RoleUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id and payload.role != "admin":
        raise HTTPException(status_code=400, detail="You cannot remove your own administrator role")
    user.role = payload.role
    db.commit()
    db.refresh(user)
    return user


@app.patch("/admin/households/{household_id}", response_model=HouseholdResponse)
def admin_update_household(
    household_id: str,
    payload: HouseholdUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> dict:
    household = (
        db.query(Household)
        .options(joinedload(Household.location))
        .filter(Household.id == household_id)
        .first()
    )
    if household is None:
        raise HTTPException(status_code=404, detail="Household not found")
    before = household_data(household)
    changes = payload.model_dump(exclude_unset=True, exclude_none=True)
    location_fields = {
        key: changes.pop(key)
        for key in ("state", "district", "city_village", "ward", "locality")
        if key in changes
    }
    for key, value in changes.items():
        setattr(household, key, value.strip() if isinstance(value, str) else value)
    if location_fields:
        household.location = upsert_location(db, location_fields, household.location)
    audit(db, household.id, admin.id, "admin_updated", "household", household.id, before, household_data(household))
    db.commit()
    db.refresh(household)
    return household_response(db, household)


@app.get("/admin/review")
def admin_review(db: Session = Depends(get_db), _admin: User = Depends(require_admin)) -> dict:
    households = db.query(Household).options(joinedload(Household.location)).all()
    by_mobile: dict[str, list[Household]] = {}
    by_address: dict[tuple[str, str], list[Household]] = {}
    for household in households:
        by_mobile.setdefault(household.mobile, []).append(household)
        by_address.setdefault((household.location_id, household.address.strip().casefold()), []).append(household)
    groups = []
    for reason, mapping in (
        ("Mobile number used by multiple households", by_mobile),
        ("Address repeated within the same locality", by_address),
    ):
        for entries in mapping.values():
            if len(entries) > 1:
                groups.append(
                    {
                        "reason": reason,
                        "households": [
                            {"id": entry.id, "household_code": entry.household_code, "head_name": entry.head_name}
                            for entry in entries
                        ],
                    }
                )
    return {"potential_duplicates": groups}


@app.get("/admin/analytics")
def admin_analytics(
    state: str | None = None,
    district: str | None = None,
    city_village: str | None = None,
    ward: str | None = None,
    locality: str | None = None,
    gender: str | None = None,
    age_group: str | None = None,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
) -> dict:
    return analytics(db, analytics_filters(state, district, city_village, ward, locality, gender, age_group))


@app.get("/admin/export.csv")
def export_census(db: Session = Depends(get_db), _admin: User = Depends(require_admin)) -> Response:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "household_id", "household_code", "head_name", "mobile", "address", "state", "district",
            "city_village", "ward", "locality", "household_registered_at", "member_name",
            "date_of_birth", "age", "gender", "relationship", "education", "occupation",
            "living_status", "member_registered_at", "member_removed_at",
        ]
    )
    households = db.query(Household).options(joinedload(Household.location), joinedload(Household.members)).all()
    for household in households:
        for member in household.members:
            if member.removed_at is None:
                writer.writerow(
                    [
                        csv_safe(value)
                        for value in [
                            household.id, household.household_code, household.head_name, household.mobile,
                            household.address, household.location.state, household.location.district,
                            household.location.city_village, household.location.ward, household.location.locality,
                            household.created_at.isoformat(), member.full_name,
                            member.date_of_birth.isoformat() if member.date_of_birth else "",
                            member.age if member.age is not None else "", member.gender, member.relationship,
                            member.education or "", member.occupation or "", member.living_status,
                            member.registered_at.isoformat(), member.removed_at.isoformat() if member.removed_at else "",
                        ]
                    ]
                )
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="smart-census-export.csv"'},
    )


def csv_safe(value: object) -> object:
    if isinstance(value, str) and value.lstrip(" \t\r\n").startswith(("=", "+", "-", "@")):
        return "'" + value
    return value
