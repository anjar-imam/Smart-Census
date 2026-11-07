# Smart Census architecture

## Application layout

- `frontend/`: React, TypeScript, Vite, Tailwind CSS, and Recharts.
- `backend/`: FastAPI REST API, SQLAlchemy ORM, Pydantic validation, and JWT sessions.
- `database/schema.sql`: PostgreSQL reference schema. SQLAlchemy creates the equivalent schema for local SQLite development.
- `backend/app/`: API routes, persistence models, configuration, authentication, and services.

## Data flow

1. A citizen requests a one-time code for a mobile number. Codes are hashed, expire, and can only be used once. `SMS_PROVIDER=console` is for local development only; production SMS delivery must be configured.
2. The verified mobile number identifies the citizen account. The citizen can register and manage only the household they own or are explicitly authorized to manage.
3. Household member mutations run in a database transaction and append an immutable before/after audit event. Removing a member is a soft delete; deceased and removed members are retained as history but excluded from current population totals.
4. The public analytics endpoint returns aggregates only. It never includes names, phone numbers, or addresses.
5. Administrator endpoints require an administrator role. Admin bootstrapping is an explicit CLI command, not a public registration option.

## Persistence

The local default is SQLite (`backend/smart_census.db`). Set `DATABASE_URL` to a PostgreSQL connection string for deployment. Foreign keys and unique constraints protect ownership, locations, and member identity within a household. Population and household totals are derived from records rather than stored counters.

## Privacy and operational boundaries

Smart Census is an independent platform and is not an official government census. Household addresses and personal details are available only to authorized household managers and administrators. Public statistics are aggregated. Production deployments must use HTTPS, a strong JWT secret, PostgreSQL backups, and a real SMS provider; the console OTP provider must not be used in production.

## Initial implementation boundary

The app is delivered as a single-service deployment: serve the Vite frontend separately and point it at the FastAPI API. The API provides OTP authentication, household/member management, audit history, public/admin analytics, and CSV export. Dashboard refresh is periodic so submissions are reflected without a manual page reload.
