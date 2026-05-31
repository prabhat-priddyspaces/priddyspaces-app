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

**Register/login** – Production web auth uses Clerk at `/sign-in`, `/sign-up`,
and `/owners/sign-up`. FastAPI verifies Clerk JWTs on protected API requests.
The backend still exposes `/auth/register` and `/auth/login` for legacy local
password-auth tests and tooling, but those endpoints are not the production web
sign-in path.

## Production build

- `npm run build` – builds the Next.js production server bundle
- `npm run start` – starts the Next.js production server
- `npm run build:export` – optional static export build into `out/`
- `npm run start:export` – serves the generated `out/` directory

Static export is only appropriate for routes that do not depend on authenticated dynamic detail pages. The booking/request detail flows should run with the normal Next server build.
