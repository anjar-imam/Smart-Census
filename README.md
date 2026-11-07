# Smart Census

Smart Census is an independent, privacy-conscious citizen self-census platform. Families can register a household, manage member records, and review their change history. The public dashboard shows aggregated population statistics only. **This is not an official government census system.**

## Project architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the application layout, data flow, privacy boundaries, and persistence design. The PostgreSQL reference schema is in [database/schema.sql](./database/schema.sql); the SQLAlchemy models create the equivalent schema for local SQLite development.

```text
frontend/                 React + TypeScript + Vite dashboard and citizen portal
backend/app/              FastAPI API, SQLAlchemy models, OTP/JWT authentication
backend/tests/            API and access-control tests
database/schema.sql       PostgreSQL reference schema
```

### Main API surfaces

| Endpoint | Access | Purpose |
|---|---|---|
| `POST /auth/request-otp` | Public | Request a one-time mobile sign-in code |
| `POST /auth/verify-otp` | Public | Verify a code and receive a bearer token |
| `GET /public/analytics` | Public | Aggregated statistics and chart data |
| `GET /public/locations` | Public | Location filter options |
| `/households` and `/households/{id}/members` | Household manager | Create and manage authorized household records |
| `/households/{id}/history` | Household manager | Review household changes |
| `/admin/*` | Administrator | Manage records/accounts, review duplicates, analytics, CSV export |

Household/member totals are derived from member rows, not manually maintained counters. Removed members are soft-deleted; deceased and removed members are retained in history but excluded from current population totals. Member changes are audit-logged. Public analytics never return names, phone numbers, or addresses.

## Requirements

- Python 3.11+ (tested with Python 3.13)
- Node.js 20+ and npm
- SQLite for local development; PostgreSQL for a shared/production deployment
- For production OTP delivery: a Twilio account and an SMS-enabled sender

## Local development

Open two PowerShell terminals from the project directory.

### 1. Start the API

```powershell
Set-Location .\backend
py -3.13 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
Copy-Item .env.example .env
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Copy the generated secret into `backend/.env` as `JWT_SECRET`. Keep `APP_ENV=development`, `DATABASE_URL=sqlite:///./smart_census.db`, and `SMS_PROVIDER=console` for local work. Start the server:

```powershell
python -m uvicorn app.main:app --reload
```

The local database is created at `backend/smart_census.db`. In console OTP mode, the one-time code is written to the **API terminal only**; it is not returned by the API. Do not enable this provider in production. Interactive API docs are available at `http://localhost:8000/docs`.

### 2. Start the frontend

```powershell
Set-Location .\frontend
npm install
Copy-Item .env.example .env
npm run dev
```

Open `http://localhost:5173`. Set `VITE_API_URL` in `frontend/.env` if the API is hosted at another local address.

### Promote an administrator

Sign in once with the mobile number in the API's development console, then—in the backend terminal—promote that verified account:

```powershell
Set-Location .\backend
.\.venv\Scripts\Activate.ps1
python -m app.create_admin +919876543210
```

Use the exact normalized number used at sign-in. Administrator routes are role-protected by the API; hiding admin links in the UI is not the security boundary.

## Synthetic demo records

Demo data is opt-in and is written only to a separate SQLite file named `smart_census_demo.db`. It never inserts demo households into the normal `smart_census.db`.

```powershell
Set-Location .\backend
.\.venv\Scripts\Activate.ps1
python -m app.seed_demo
$env:DATABASE_URL = "sqlite:///./smart_census_demo.db"
python -m uvicorn app.main:app --reload
```

The isolated sample has three households and thirteen synthetic members. Phone numbers, household IDs, addresses, localities, and labels are clearly marked as demo data. For demo sign-in, request an OTP for `+919000000001`, `+919000000002`, `+919000000003`, or the demo administrator `+919000000099`; read the code in the API terminal.

## Configuration

Copy the example files and provide environment-specific values; never commit populated `.env` files.

### Backend (`backend/.env`)

| Variable | Development value | Production guidance |
|---|---|---|
| `APP_ENV` | `development` | Set to `production` |
| `DATABASE_URL` | `sqlite:///./smart_census.db` | PostgreSQL, e.g. `postgresql+psycopg://user:password@host:5432/smart_census` |
| `JWT_SECRET` | Random value from `secrets.token_urlsafe(48)` | Strong secret of at least 32 characters |
| `JWT_EXPIRE_MINUTES` | `720` | Choose an expiry appropriate to your risk requirements |
| `SMS_PROVIDER` | `console` | Set to `twilio`; console mode is rejected in production |
| `OTP_EXPIRE_MINUTES` | `5` | Keep short |
| `OTP_MAX_ATTEMPTS` | `5` | Failed attempts per issued code |
| `FRONTEND_ORIGINS` | `http://localhost:5173` | Exact deployed frontend origin(s), comma-separated |
| `TWILIO_ACCOUNT_SID` | blank | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | blank | Store as a secret |
| `TWILIO_FROM_NUMBER` | blank | Verified Twilio number in international format |

### Frontend (`frontend/.env`)

| Variable | Value |
|---|---|
| `VITE_API_URL` | API origin, e.g. `http://localhost:8000` |

## Tests and builds

```powershell
Set-Location .\backend
.\.venv\Scripts\Activate.ps1
python -m pytest
```

```powershell
Set-Location .\frontend
npm run build
```

The API tests cover OTP sign-in, household/member updates and audit history, aggregate-only public data, household ownership isolation, administrator authorization, and CSV export.

## Deployment

The deployment configuration is included: [`render.yaml`](./render.yaml) creates a Singapore Render API service and persistent PostgreSQL database; [`netlify.toml`](./netlify.toml) configures the Netlify frontend build and React Router fallback. The Render blueprint selects billable `starter` and `basic-256mb` plans. Check current provider pricing before deploying.

1. Push the project to a private GitHub repository. Do not commit `.env` files, production records, or secrets.
2. In Render, create a new Blueprint from the repository root and review the plan and region before confirming resource creation. Render will prompt for the three `TWILIO_*` values. Enter them in Render's secret environment-variable form; never put credentials in the repository or chat.
3. After the Render API is healthy at `https://smart-census-api.onrender.com/health`, create a Netlify site from the same repository. Netlify reads `netlify.toml`; leave the site base/build/publish settings at their detected values and set the build environment variable `VITE_API_URL` to the Render API origin, e.g. `https://smart-census-api.onrender.com`.
4. Copy the actual Netlify production origin from site settings, then update Render's `FRONTEND_ORIGINS` environment variable to that exact origin and redeploy the API.
5. Test OTP delivery, household/member creation, public aggregate statistics, and administrator-only CSV export on the deployed services. Only then create the first administrator: sign in with its verified phone number, open Render's Shell for the API service, and run `python -m app.create_admin <verified-mobile-number>`.
6. Confirm database backups and a restore procedure before entering real household data. Keep API and database access restricted, enforce HTTPS, and review hosting, SMS, backup, and data-retention requirements.

`netlify.toml` configures Netlify to build the `frontend/` Vite application and route React Router paths back to the SPA entry point. Set `VITE_API_URL` in Netlify's site environment variables to the HTTPS origin of the deployed FastAPI API before building. Netlify hosts the frontend only; it does not run this FastAPI backend or provide its PostgreSQL database.

Render's PostgreSQL connection strings (`postgres://` or `postgresql://`) are normalized to the installed `psycopg` driver by the API. The included production checks reject a weak JWT secret and console OTP mode. The Render starter/database resources incur charges; do not create them without reviewing and accepting the current pricing.

This initial project uses SQLAlchemy `create_all` for first-run schema creation and is intended for a fresh database. Use reviewed, versioned migrations before evolving an established production schema. Population and area trends are calculated from member audit events and reflect the events retained by this application; they are not an authoritative census or an estimate of unregistered residents.
