"""Seed the isolated smart_census_demo.db with unmistakably synthetic records."""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import FamilyMember, Household, HouseholdManager, Location, User

DEMO_DATABASE_URL = "sqlite:///./smart_census_demo.db"

SAMPLES = [
    {
        "phone": "+919000000001",
        "head": "Aarav Sharma",
        "address": "DEMO DATA — 12 Sample Road",
        "location": ("DEMO — Maharashtra", "DEMO — Pune", "DEMO — Pune", "DEMO — 1", "DEMO — Kothrud"),
        "members": [
            ("Aarav Sharma", 38, "male", "Self"),
            ("Meera Sharma", 35, "female", "Spouse"),
            ("Ishaan Sharma", 9, "male", "Child"),
            ("Anaya Sharma", 6, "female", "Child"),
        ],
    },
    {
        "phone": "+919000000002",
        "head": "Fatima Khan",
        "address": "DEMO DATA — 34 Example Lane",
        "location": ("DEMO — Delhi", "DEMO — Central Delhi", "DEMO — New Delhi", "DEMO — 4", "DEMO — Karol Bagh"),
        "members": [
            ("Fatima Khan", 42, "female", "Self"),
            ("Imran Khan", 45, "male", "Spouse"),
            ("Sara Khan", 19, "female", "Child"),
            ("Zoya Khan", 15, "female", "Child"),
            ("Amir Khan", 68, "male", "Parent"),
            ("Amina Khan", 64, "female", "Parent"),
        ],
    },
    {
        "phone": "+919000000003",
        "head": "Rohan Patel",
        "address": "DEMO DATA — 8 Fictional Avenue",
        "location": ("DEMO — Gujarat", "DEMO — Ahmedabad", "DEMO — Ahmedabad", "DEMO — 2", "DEMO — Navrangpura"),
        "members": [
            ("Rohan Patel", 31, "male", "Self"),
            ("Kavya Patel", 29, "female", "Spouse"),
            ("Dev Patel", 1, "male", "Child"),
        ],
    },
]


def main() -> None:
    engine = create_engine(DEMO_DATABASE_URL, connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as db:
        if db.query(User).first():
            print("Demo database already contains records; leaving it unchanged.")
            return
        admin = User(phone="+919000000099", role="admin")
        db.add(admin)
        db.flush()
        for sample in SAMPLES:
            user = User(phone=sample["phone"], role="citizen")
            db.add(user)
            location = Location(
                state=sample["location"][0],
                district=sample["location"][1],
                city_village=sample["location"][2],
                ward=sample["location"][3],
                locality=sample["location"][4],
            )
            db.add(location)
            db.flush()
            household = Household(
                household_code=f"DEMO-SC-{len(sample['phone'])}-{sample['phone'][-4:]}",
                head_name=sample["head"],
                mobile=sample["phone"],
                address=sample["address"],
                location=location,
                created_by=user.id,
            )
            db.add(household)
            db.flush()
            db.add(HouseholdManager(household_id=household.id, user_id=user.id))
            for name, age, gender, relationship in sample["members"]:
                db.add(
                    FamilyMember(
                        household_id=household.id,
                        full_name=name,
                        age=age,
                        gender=gender,
                        relationship=relationship,
                        living_status="active",
                    )
                )
        db.commit()
    print("Seeded 3 demo households and 13 demo members in smart_census_demo.db only.")
    print("Demo sign-in phones: +919000000001, +919000000002, +919000000003")
    print("Demo administrator phone: +919000000099")
    print("Start the API with DATABASE_URL=sqlite:///./smart_census_demo.db to use this data.")


if __name__ == "__main__":
    main()
