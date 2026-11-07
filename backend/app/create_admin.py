import argparse

from app.database import Base, SessionLocal, engine
from app.models import User


def main() -> None:
    parser = argparse.ArgumentParser(description="Promote a verified Smart Census user to administrator.")
    parser.add_argument("phone", help="The verified mobile number for the administrator account")
    phone = parser.parse_args().phone
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(phone=phone).first()
        if user is None:
            parser.error("No verified user with that phone number exists. Sign in once before promoting the account.")
        user.role = "admin"
        db.commit()
        print(f"Administrator role granted to user {user.id}.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
