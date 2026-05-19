# Infra Security Handoff

Target infra branch: `codex/soc2-owasp-infra`

Target base branch: `main`

This app repository does not contain Terraform, CDK, CloudFormation, or other AWS IaC. The separate infra repository must implement the controls below before staging/prod SOC 2 readiness can be asserted.

## Required Infra Controls

| Area | Acceptance criteria |
| --- | --- |
| Network | ECS tasks and RDS run in private subnets. ALB and CloudFront are the only public ingress. Security groups allow only required ports. VPC endpoints exist for S3, ECR API/DKR, CloudWatch Logs, Secrets Manager, SSM, and KMS where supported. |
| Edge/API protection | CloudFront and ALB use ACM certificates and TLS 1.2/1.3 policies. HSTS is enabled. AWS WAF managed rules, AWS IP reputation list, request-size rules, and rate-based rules protect auth, assistant, webhook, booking, and payment endpoints. |
| Data protection | RDS uses customer-managed KMS encryption, deletion protection, PITR backups, Multi-AZ for staging/prod, and SSL-required DB connections. CloudWatch log groups and S3 buckets are encrypted. Bucket policies deny non-TLS requests. |
| Storage | Buckets or strict prefixes separate public assets, user uploads, invoices, logs, and backups. Public access is blocked by default. Public assets use CloudFront OAC. Uploads land in quarantine and pass malware scanning before publication. Lifecycle policies are defined. |
| Secrets/IAM | Runtime secrets live in Secrets Manager or encrypted SSM. ECS task roles are least privilege. GitHub OIDC roles are restricted by repo, branch, workflow, and environment. No long-lived AWS access keys are used. Production deploys require GitHub Environment approval. |
| Runtime hardening | ECS services use desired count at least 2 for staging/prod, deployment circuit breakers, health checks, autoscaling, non-root containers, compatible read-only root filesystems, and ECR scan gates before service update. |
| Monitoring/evidence | CloudTrail, GuardDuty, Security Hub, AWS Config, IAM Access Analyzer, CloudWatch alarms, ALB logs, WAF logs, CloudFront logs, RDS events, ECS deployment alarms, log retention, and alert destinations are configured. |
| Resilience | AWS Backup plans cover RDS and critical state. Snapshot retention is environment-specific. Restore-test runbook exists. RTO/RPO targets are documented. Quarterly restore evidence is retained. |

## Required Infra CI

Every infra PR must run:

```bash
terraform fmt -check
terraform validate
terraform plan -out=tfplan
checkov -d .
# or tfsec/trivy config with an equivalent blocking policy
```

Artifacts:

- Terraform plan summary retained on the PR.
- Full plan artifact retained for reviewer download.
- Checkov/tfsec SARIF uploaded when supported.
- IAM policy simulation or Access Analyzer validation for deploy and runtime roles.

## WAF Rules

Minimum WAF coverage:

- AWS managed common rule set.
- AWS known bad inputs rule set.
- AWS SQLi rule set.
- AWS IP reputation rule set.
- Request body size limit for API routes.
- Rate-based rule for `/auth/*`.
- Rate-based rule for `/api/assistant/chat`.
- Rate-based rule for `/api/webhooks/*`, with provider IP/signature behavior considered before blocking.
- Rate-based rule for `/api/guest/booking-requests`, `/api/booking-requests`, `/api/payments`, and `/api/payment-methods`.

## Storage And Upload Flow

Target upload state:

1. App presigns only opaque keys under quarantine prefixes.
2. S3 object-created event invokes malware scan.
3. Clean files are copied or tagged into publishable prefixes.
4. Infected or invalid files are isolated, alerts are emitted, and app records are not published.
5. CloudFront OAC serves only publishable public assets.

## Deployment Rollout

Roll out in this order:

1. Dev: deploy infra, run smoke tests, verify WAF logs and alarm destinations.
2. Staging: enable production-like app config, private networking, Multi-AZ, backup plan, and restore dry run.
3. Production: require human approval, confirm current backup, deploy during approved window, monitor alarms and WAF blocks.

## Infra Test Plan

- IaC format, validate, security scan, and plan artifact review.
- TLS/header check against CloudFront and ALB origins.
- Private reachability check: ECS can reach RDS and endpoints; public internet cannot reach ECS/RDS directly.
- IAM policy simulation for ECS task roles and GitHub deploy roles.
- WAF smoke tests for request-size and rate-limit behavior.
- Non-prod backup restore dry run and documented result.

## Evidence Outputs

Store these artifacts for audit:

- Merged infra PRs with approvals.
- Terraform plans and applies.
- WAF sampled requests and logs.
- CloudTrail and GuardDuty/Security Hub evidence exports.
- Backup restore reports with timestamps and RTO/RPO measurements.
- Production deploy approvals and change records.
