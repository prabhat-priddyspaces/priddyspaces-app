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
- Enable static website hosting.
- Set index document: `index.html`.
- For SPA routing, configure CloudFront to serve `index.html` on 404s.

## CORS (FastAPI)
- Allow your web origin in CORS settings.
- If using cookies, set:
  - `Access-Control-Allow-Credentials: true`
  - `SameSite=Lax` or `None` + `Secure` for cross-site
