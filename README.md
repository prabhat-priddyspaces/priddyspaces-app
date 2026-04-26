# Priddyspaces Coworking Platform (MVP)

Monorepo with:
- `backend/` FastAPI API
- `webUI/` Next.js web app
- `mobile/` Expo React Native app
- `docs/` architecture, flows, API, DB notes

## Prerequisites
- Node.js 20+
- npm 10+
- Python 3.11+
- Docker (for Postgres)

## Quick start (Docker for backend + DB)

From the project root:

```bash
docker compose up -d --build
```

This starts:
- **Postgres** on host port **5433** (container port 5432)
- **Backend API** on **http://localhost:8000**

The backend container:
- waits for Postgres
- runs Alembic migrations automatically
- starts Uvicorn with reload enabled

### Web UI (local dev)

```bash
cd webUI
npm install
npm run dev
```

Visit **http://localhost:3000**.

`npm run dev` uses webpack-based dev mode by default to avoid Turbopack instability on this project. If you want to try Turbopack explicitly, use `npm run dev:turbo`.

### Web UI

```bash
cd webUI
npm install
npm run build
npm start
```

`npm start` runs the Next.js production server. This is the supported mode for authenticated owner/customer flows and dynamic detail pages.

### Mobile

```bash
cd mobile
npm install
npm run start
```

## Local backend without Docker (optional)

If you prefer running the backend locally:

```bash
cd backend
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
```

Set **backend/.env**:
- `DATABASE_URL=postgresql+psycopg2://priddyspaces:priddyspaces@localhost:5433/priddyspaces`

Then:

```bash
python -m alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

## Useful Docker commands

```bash
docker compose up -d --build   # start/rebuild services
docker compose ps              # list running containers
docker compose logs -f backend # backend logs
docker compose down -v         # stop + remove volumes (resets DB)
```

## Documentation
- `docs/architecture.md`
- `docs/flows.md`
- `docs/api.md`
- `docs/db.md`
- `docs/auth.md`
- `docs/static-web-hosting.md`

## Notes
- Uses UUID v7 public IDs for all externally exposed entities.
- Payments: Stripe (single account for MVP).
- Email verification required before payment.
- Booking overlap prevention when a space is already subscribed.
