# SOC 2 Type II and OWASP Readiness

Version date: 2026-05-19

Scope: Priddyspaces app repository (`backend`, `webUI`, `mobile`, CI/CD workflows) plus handoff requirements for the separate AWS infrastructure repository.

Primary references:

- OWASP Top 10:2025: https://owasp.org/Top10/2025/
- AICPA 2017 Trust Services Criteria, revised points of focus 2022: https://www.aicpa-cima.com/resources/download/2017-trust-services-criteria-with-revised-points-of-focus-2022

## Implemented App Controls

| Area | Control | Evidence |
| --- | --- | --- |
| Configuration | Production-like environments require `ENVIRONMENT`, HTTPS app URLs, strict CORS, Clerk secrets, JWT secret, and payment encryption key. `DEBUG=true` and wildcard CORS fail closed. | `backend/app/core/config.py`, `backend/.env.example` |
| Headers | FastAPI and Next responses emit security headers. HSTS is limited to staging/prod. CSP allowlists Clerk, Stripe, Google Maps, API, asset, and websocket domains. | `backend/app/main.py`, `webUI/next.config.js` |
| Rate limiting | Sensitive POST endpoints are rate limited in app, with WAF rate rules required in infra for distributed enforcement. | `backend/app/core/rate_limit.py` |
| Auth/session | Web access tokens are memory-only except the explicit Playwright Clerk bypass path. Mobile legacy token storage uses `expo-secure-store`. | `webUI/lib/auth.ts`, `mobile/src/lib/storage.ts` |
| Credential encryption | New owner payment credentials use AES-GCM (`v2:`). Legacy `v1:` values remain decrypt-only and are re-encrypted when the setting is touched. | `backend/app/core/crypto.py`, `backend/app/api/owner_payments.py` |
| Uploads | Floor-plan presigns are scoped to an authorized `location_public_id`. Space/floor-plan uploads validate image MIME, extension, and size, issue opaque S3 keys, and return server-derived public URLs. | `backend/app/services/storage.py`, `backend/app/api/floor_plans.py`, `backend/app/api/media.py` |
| Payment gates | Verified email is required before payment intents, subscriptions, payment method setup/save, retry payment, and booking flows that create payment-linked activity. | `backend/app/services/auth_user.py`, payment and booking API modules |
| Marketing HTML | Marketing templates render through a sandboxed Jinja environment and sanitize HTML before preview/outbound use. Unsafe preview DOM injection was removed. | `backend/app/services/marketing.py`, `webUI/app/owner/marketing/templates/page.tsx` |
| Legal pages | Privacy and terms pages use static version dates instead of dynamic dates. | `webUI/app/privacy/page.tsx`, `webUI/app/terms/page.tsx` |
| Runtime | Backend and web containers run as non-root users. Read-only root filesystems remain an ECS task-definition control for the infra repo. | `backend/Dockerfile`, `webUI/Dockerfile` |
| Supply chain | Dependabot, CodeQL, `pip-audit`, Bandit, `npm audit --omit=dev`, and SBOM artifact generation are configured. | `.github/dependabot.yml`, `.github/workflows/codeql.yml`, `.github/workflows/security.yml` |

## OWASP Top 10:2025 Mapping

| OWASP category | App controls |
| --- | --- |
| A01 Broken Access Control | Location-scoped floor-plan presigns, owner/admin authorization checks, protected payment method ownership checks, tests for scoped uploads. |
| A02 Security Misconfiguration | Production config validator, strict CORS, security headers, non-root containers, static legal dates, no demo password logging. |
| A03 Software Supply Chain Failures | Dependabot, CodeQL, backend and npm audits, Bandit, SBOM artifact retention, patched web/mobile production audit findings. |
| A04 Cryptographic Failures | AES-GCM payment credential encryption, fail-closed production encryption key requirement, no production default crypto fallback. |
| A05 Injection | Sanitized marketing template HTML, sandboxed Jinja rendering, iframe preview sandbox, CSP. |
| A06 Insecure Design | Fail-closed production config, verified-email gates before payment-linked workflows, documented infra WAF and private-network requirements. |
| A07 Authentication Failures | Clerk token memory-only web storage, secure mobile token storage, sensitive endpoint rate limiting. |
| A08 Software/Data Integrity Failures | SBOM, CodeQL, audit gates, opaque upload keys, infra handoff for malware quarantine before publication. |
| A09 Logging/Alerting Failures | Infra handoff requires CloudTrail, GuardDuty, Security Hub, AWS Config, WAF/ALB/CloudFront logs, CloudWatch alarms, and evidence export. |
| A10 Mishandling Exceptional Conditions | Production errors suppress traceback unless `DEBUG=true`; production validator prevents debug mode. |

## SOC 2 Mapping

| Trust Services category | Current app evidence | Required operating evidence |
| --- | --- | --- |
| Security | Auth hardening, rate limits, security headers, supply-chain scans, non-root containers. | Access reviews, vulnerability triage, incident response drills, security monitoring exports. |
| Availability | Health endpoint, CI checks, infra handoff for autoscaling, Multi-AZ, alarms, backups, restore tests. | Uptime reports, incident postmortems, backup and restore evidence, change approval records. |
| Confidentiality | AES-GCM credentials, fail-closed secrets, private infra requirements, TLS-only storage policies in infra handoff. | Data classification, secret rotation logs, least-privilege IAM reviews. |
| Processing Integrity | Payment email-verification gates, idempotent payment paths already present, CI validation. | Payment reconciliation, webhook processing review, change-management evidence. |
| Privacy | Static privacy policy versioning, consent timestamps already modeled in auth, sanitized marketing content. | DSR records, retention reviews, vendor privacy reviews, privacy notice approvals. |

## Evidence To Collect Over Time

- Weekly dependency review: Dependabot PRs, `security.yml` runs, npm and pip audit output.
- Quarterly access review: GitHub, AWS IAM/Identity Center, Clerk, Stripe, SendGrid, OpenAI, production database.
- Quarterly restore evidence: RDS snapshot restore, application smoke test, actual RTO/RPO measured.
- Incident response drill: timeline, roles, communications, containment, postmortem, corrective actions.
- Vendor review: subprocessor inventory, SOC reports, DPAs, risk acceptance.
- Change management: PR approvals, CI results, deployment approvals, release notes.
- Monitoring exports: CloudTrail, GuardDuty, Security Hub, WAF, ALB/CloudFront logs, ECS deploy alarms.

## Local Validation

Run the relevant subset for changes:

```bash
cd backend
.venv/bin/python -m pytest -q
.venv/bin/python -m alembic upgrade head

cd ../webUI
npm run lint
npm test
npm run build
npm run test:e2e
npm audit --omit=dev --audit-level=moderate

cd ../mobile
npm test -- --runInBand
npm audit --omit=dev --audit-level=moderate
```

## Residual Dependencies

- The separate infra repo must implement `docs/compliance/infra-security-handoff.md` before staging/prod can be considered SOC 2-ready.
- SOC 2 Type II requires operating evidence over time; this PR only creates technical controls and evidence hooks.
- Mobile npm install still warns about Clerk transitive Solana wallet peer ranges against React Native 0.73.6. The production audit is clean, but the peer warning should be tracked during the next Expo/React Native upgrade.
