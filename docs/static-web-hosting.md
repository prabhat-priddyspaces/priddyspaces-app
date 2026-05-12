# Static Web Hosting (S3/CloudFront)

## Build
1) Set API base URL for the web app:
   - `NEXT_PUBLIC_API_BASE_URL=https://api.example.com`
2) Build the static site:
   - `cd webUI`
   - `npm install`
   - `npm run build:export`
3) Output is in `webUI/out/`

## Notes
- Static export is opt-in through `NEXT_OUTPUT_MODE=export`.
- Authenticated dynamic routes such as member booking/request detail pages are not a good fit for static export and should run with the normal Next server build.

## S3 + CloudFront
- Upload `webUI/out/` to the bucket root.
- Use CloudFront in front of the S3 REST origin with origin access control.
- Attach a viewer-request rewrite that maps extensionless clean URLs to the static export files:
  - `/spaces` → `/spaces.html`
  - `/owners/sign-up` → `/owners/sign-up.html`
  - `/member/requests` → `/member/requests.html`
- Keep the 403/404 fallback to `/index.html` only as a last-resort client recovery path. The app root fallback redirects to matching `.html` files where possible, but CloudFront should resolve normal clean URLs before fallback.

## CORS (FastAPI)
- Allow your web origin in CORS settings.
- If using cookies, set:
  - `Access-Control-Allow-Credentials: true`
  - `SameSite=Lax` or `None` + `Secure` for cross-site
