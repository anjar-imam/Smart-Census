from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class OtpRequest(BaseModel):
    phone: str = Field(min_length=8, max_length=32)

    @field_validator("phone")
    @classmethod
    def normalize_phone(cls, value: str) -> str:
        normalized = "".join(char for char in value.strip() if char.isdigit() or char == "+")
        if len(normalized) < 8:
            raise ValueError("Enter a valid mobile number")
        return normalized


class OtpVerify(OtpRequest):
    code: str = Field(pattern=r"^\d{6}$")


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserResponse"


class UserResponse(BaseModel):
    id: str
    phone: str
    role: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class HouseholdCreate(BaseModel):
    head_name: str = Field(min_length=2, max_length=160)
    mobile: str = Field(min_length=8, max_length=32)
    state: str = Field(min_length=2, max_length=100)
    district: str = Field(min_length=2, max_length=100)
    city_village: str = Field(min_length=2, max_length=120)
    ward: str = Field(min_length=1, max_length=40)
    locality: str = Field(min_length=2, max_length=120)
    address: str = Field(min_length=3, max_length=500)
    consent: Literal[True]


class HouseholdUpdate(BaseModel):
    head_name: str | None = Field(default=None, min_length=2, max_length=160)
    mobile: str | None = Field(default=None, min_length=8, max_length=32)
    state: str | None = Field(default=None, min_length=2, max_length=100)
    district: str | None = Field(default=None, min_length=2, max_length=100)
    city_village: str | None = Field(default=None, min_length=2, max_length=120)
    ward: str | None = Field(default=None, min_length=1, max_length=40)
    locality: str | None = Field(default=None, min_length=2, max_length=120)
    address: str | None = Field(default=None, min_length=3, max_length=500)


class MemberCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=160)
    date_of_birth: date | None = None
    age: int | None = Field(default=None, ge=0, le=125)
    gender: Literal["male", "female", "other", "prefer_not_to_say"]
    relationship: str = Field(min_length=2, max_length=80)
    education: str | None = Field(default=None, max_length=100)
    occupation: str | None = Field(default=None, max_length=120)
    living_status: Literal["active", "deceased"] = "active"

    @model_validator(mode="after")
    def require_age_or_dob(self):
        if self.age is None and self.date_of_birth is None:
            raise ValueError("Provide either an age or date of birth")
        if self.date_of_birth and self.date_of_birth > date.today():
            raise ValueError("Date of birth cannot be in the future")
        return self


class MemberUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=160)
    date_of_birth: date | None = None
    age: int | None = Field(default=None, ge=0, le=125)
    gender: Literal["male", "female", "other", "prefer_not_to_say"] | None = None
    relationship: str | None = Field(default=None, min_length=2, max_length=80)
    education: str | None = Field(default=None, max_length=100)
    occupation: str | None = Field(default=None, max_length=120)
    living_status: Literal["active", "deceased"] | None = None

    @field_validator("date_of_birth")
    @classmethod
    def validate_date_of_birth(cls, value: date | None) -> date | None:
        if value and value > date.today():
            raise ValueError("Date of birth cannot be in the future")
        return value


class MemberResponse(BaseModel):
    id: str
    household_id: str
    full_name: str
    date_of_birth: date | None
    age: int | None
    gender: str
    relationship: str
    education: str | None
    occupation: str | None
    living_status: str
    registered_at: datetime

    model_config = ConfigDict(from_attributes=True)


class HouseholdResponse(BaseModel):
    id: str
    household_code: str
    head_name: str
    mobile: str
    address: str
    state: str
    district: str
    city_village: str
    ward: str
    locality: str
    created_at: datetime
    member_count: int


class HistoryResponse(BaseModel):
    id: str
    action: str
    entity_type: str
    entity_id: str
    before_data: str | None
    after_data: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RoleUpdate(BaseModel):
    role: Literal["citizen", "admin"]
