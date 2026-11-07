-- PostgreSQL reference schema. The SQLAlchemy models in backend/app/models.py
-- create the equivalent schema for SQLite development and application startup.
CREATE TABLE users (
    id VARCHAR(36) PRIMARY KEY,
    phone VARCHAR(32) NOT NULL UNIQUE,
    role VARCHAR(16) NOT NULL DEFAULT 'citizen'
        CHECK (role IN ('citizen', 'admin')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE locations (
    id VARCHAR(36) PRIMARY KEY,
    state VARCHAR(100) NOT NULL,
    district VARCHAR(100) NOT NULL,
    city_village VARCHAR(120) NOT NULL,
    ward VARCHAR(40) NOT NULL,
    locality VARCHAR(120) NOT NULL,
    UNIQUE (state, district, city_village, ward, locality)
);

CREATE TABLE households (
    id VARCHAR(36) PRIMARY KEY,
    household_code VARCHAR(24) NOT NULL UNIQUE,
    head_name VARCHAR(160) NOT NULL,
    mobile VARCHAR(32) NOT NULL,
    address TEXT NOT NULL,
    location_id VARCHAR(36) NOT NULL REFERENCES locations(id),
    created_by VARCHAR(36) NOT NULL REFERENCES users(id),
    consent_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE household_managers (
    household_id VARCHAR(36) NOT NULL REFERENCES households(id),
    user_id VARCHAR(36) NOT NULL REFERENCES users(id),
    PRIMARY KEY (household_id, user_id)
);

CREATE TABLE family_members (
    id VARCHAR(36) PRIMARY KEY,
    household_id VARCHAR(36) NOT NULL REFERENCES households(id),
    full_name VARCHAR(160) NOT NULL,
    date_of_birth DATE,
    age INTEGER CHECK (age IS NULL OR age BETWEEN 0 AND 125),
    gender VARCHAR(32) NOT NULL,
    relationship VARCHAR(80) NOT NULL,
    education VARCHAR(100),
    occupation VARCHAR(120),
    living_status VARCHAR(16) NOT NULL DEFAULT 'active'
        CHECK (living_status IN ('active', 'deceased')),
    registered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    removed_at TIMESTAMP
);

CREATE TABLE otp_challenges (
    id VARCHAR(36) PRIMARY KEY,
    phone VARCHAR(32) NOT NULL,
    code_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    consumed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE household_history (
    id VARCHAR(36) PRIMARY KEY,
    household_id VARCHAR(36) NOT NULL REFERENCES households(id),
    actor_id VARCHAR(36) NOT NULL REFERENCES users(id),
    action VARCHAR(32) NOT NULL,
    entity_type VARCHAR(32) NOT NULL,
    entity_id VARCHAR(36) NOT NULL,
    before_data TEXT,
    after_data TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_households_location ON households(location_id);
CREATE INDEX idx_members_household_status ON family_members(household_id, living_status, removed_at);
CREATE INDEX idx_history_household_created ON household_history(household_id, created_at);
CREATE INDEX idx_otp_phone_created ON otp_challenges(phone, created_at);
