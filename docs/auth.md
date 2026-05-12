# Auth (FastAPI + JWT)

## Goal
- Static web frontend (S3/CloudFront)
- Auth handled by backend (FastAPI)
- JWT access tokens with refresh rotation
- Email via SendGrid from backend

## Recommended flow (JWT)
1) Web app calls backend auth endpoint.
2) Backend verifies credentials or OAuth code (if enabled).
3) Backend issues short-lived JWT access token + refresh cookie.
4) Web app uses `Authorization: Bearer` for API calls.

## Session options
- JWT bearer + refresh cookie (httpOnly, Secure, SameSite=Lax)

## Required claims (JWT)
- `sub` (user public_id)
- `email`
- `email_verified`
- `role` (owner/admin/member)

## Backend responsibilities
- Token issuance, verification, and rotation
- OAuth client secrets stay on backend only (if providers enabled)
- Email sending (SendGrid)
- CORS allowlist for web origin

## Frontend expectations
- Frontend never handles OAuth secrets
- Frontend calls FastAPI for auth + API
- Store access token in memory and refresh via cookie
- Ensure `credentials: "include"` for refresh

## Env (backend)
- `AUTH_ISSUER`
- `AUTH_AUDIENCE`
- `BACKEND_URL`
- `FRONTEND_URL`
- `OAUTH_GOOGLE_CLIENT_ID` (optional)
- `OAUTH_GOOGLE_CLIENT_SECRET` (optional)
- `OAUTH_APPLE_CLIENT_ID` (optional)
- `OAUTH_APPLE_TEAM_ID` (optional)
- `OAUTH_APPLE_KEY_ID` (optional)
- `OAUTH_APPLE_PRIVATE_KEY` (optional)
- `CORS_ALLOW_ORIGINS`

## Apple local dev note
- Apple Sign In requires HTTPS for callbacks.
- Use a tunnel (ngrok/cloudflared) for local testing.
- `OAUTH_{PROVIDER}_CLIENT_ID`
- `OAUTH_{PROVIDER}_CLIENT_SECRET`
- `SESSION_SECRET`
- `FRONTEND_URL`
