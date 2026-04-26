# Priddyspaces Web

The **web UI** (this app) runs on port 3000. The **API** (auth, register, locations, bookings, etc.) runs on the **backend** (FastAPI, usually port 8000). The frontend calls the backend using `NEXT_PUBLIC_API_BASE_URL`.

## Setup

1. Copy `.env.example` to `.env` and set:
   ```bash
   NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
   ```
2. Start the **backend** (from the `backend/` folder), e.g. `uvicorn app.main:app --reload`.
3. Start the web UI (see below).

## Local development (auto-reload on every change)

Run the dev server so the app refreshes automatically when you edit files:

```bash
npm run dev
```

or:

```bash
npm run local
```

Then open [http://localhost:3000](http://localhost:3000). Changes to the code will hot-reload in the browser.

`npm run dev` uses webpack mode by default. If you want to try Turbopack explicitly, run:

```bash
npm run dev:turbo
```

**Register/login** – The form on the site sends requests to the **backend** URL. For direct API calls (e.g. curl), use the backend, not the frontend:

```bash
# Wrong (404): frontend has no /auth/register route
curl http://localhost:3000/auth/register ...

# Correct: call the backend
curl http://localhost:8000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"secret","first_name":"Jane","last_name":"Doe","role":"owner","terms_accepted":true,"privacy_policy_accepted":true}'
```

## Production build

- `npm run build` – builds the Next.js production server bundle
- `npm run start` – starts the Next.js production server
- `npm run build:export` – optional static export build into `out/`
- `npm run start:export` – serves the generated `out/` directory

Static export is only appropriate for routes that do not depend on authenticated dynamic detail pages. The booking/request detail flows should run with the normal Next server build.
