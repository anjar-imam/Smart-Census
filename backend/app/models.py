from datetime import date, datetime, timezone
from uuid import uuid4

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship as orm_relationship

from app.database import Base


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    phone: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    role: Mapped[str] = mapped_column(String(16), default="citizen")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class Location(Base):
    __tablename__ = "locations"
    __table_args__ = (
        UniqueConstraint("state", "district", "city_village", "ward", "locality", name="uq_location_path"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    state: Mapped[str] = mapped_column(String(100))
    district: Mapped[str] = mapped_column(String(100))
    city_village: Mapped[str] = mapped_column(String(120))
    ward: Mapped[str] = mapped_column(String(40))
    locality: Mapped[str] = mapped_column(String(120))
    households: Mapped[list["Household"]] = orm_relationship(back_populates="location")


class Household(Base):
    __tablename__ = "households"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    household_code: Mapped[str] = mapped_column(String(24), unique=True, index=True)
    head_name: Mapped[str] = mapped_column(String(160))
    mobile: Mapped[str] = mapped_column(String(32))
    address: Mapped[str] = mapped_column(Text)
    location_id: Mapped[str] = mapped_column(ForeignKey("locations.id"), index=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    consent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)

    location: Mapped[Location] = orm_relationship(back_populates="households")
    managers: Mapped[list["HouseholdManager"]] = orm_relationship(
        back_populates="household", cascade="all, delete-orphan"
    )
    members: Mapped[list["FamilyMember"]] = orm_relationship(
        back_populates="household", cascade="all, delete-orphan"
    )


class HouseholdManager(Base):
    __tablename__ = "household_managers"

    household_id: Mapped[str] = mapped_column(ForeignKey("households.id"), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    household: Mapped[Household] = orm_relationship(back_populates="managers")


class FamilyMember(Base):
    __tablename__ = "family_members"
    __table_args__ = (Index("idx_members_household_status", "household_id", "living_status", "removed_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    household_id: Mapped[str] = mapped_column(ForeignKey("households.id"), index=True)
    full_name: Mapped[str] = mapped_column(String(160))
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)
    age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    gender: Mapped[str] = mapped_column(String(32))
    relationship: Mapped[str] = mapped_column(String(80))
    education: Mapped[str | None] = mapped_column(String(100), nullable=True)
    occupation: Mapped[str | None] = mapped_column(String(120), nullable=True)
    living_status: Mapped[str] = mapped_column(String(16), default="active")
    registered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    removed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    household: Mapped[Household] = orm_relationship(back_populates="members")


class OtpChallenge(Base):
    __tablename__ = "otp_challenges"
    __table_args__ = (Index("idx_otp_phone_created", "phone", "created_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    phone: Mapped[str] = mapped_column(String(32))
    code_hash: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class HouseholdHistory(Base):
    __tablename__ = "household_history"
    __table_args__ = (Index("idx_history_household_created", "household_id", "created_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    household_id: Mapped[str] = mapped_column(ForeignKey("households.id"), index=True)
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(32))
    entity_type: Mapped[str] = mapped_column(String(32))
    entity_id: Mapped[str] = mapped_column(String(36))
    before_data: Mapped[str | None] = mapped_column(Text, nullable=True)
    after_data: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
