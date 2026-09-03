# Mindoist CI/CD runbook

This is the short delivery contract for agents and contributors. Read it
before changing product, Edge Functions, or deployment files.

## Branches

- `main` is the only production source of truth. Normal changes go through a
  pull request into `main`.
- `staging` is retained as an environment/reference branch. The staging
  workflow is triggered from a successful `main` CI run; do not use `staging`
  as the base for feature work.
- `fix/*`, `feat/*`, and `chore/*` branches are temporary. Delete the remote
  and local branch after the pull request is merged. Do not leave merged PR
  heads around.
- Keep at most `main`, `staging`, and the active work branch. Never force-push
  `main`.

Normal flow:

```text
origin/main -> short-lived branch -> PR -> CI green -> merge main
                                      |
                                      +-> delete branch
main CI green -> staging deploy/smoke -> production manual deploy (exact SHA)
```

## What is allowed to change

Product source and its tests live in:

- `apps/web/src/**`, `apps/web/e2e/**` — web UI and browser tests;
- `apps/api/src/**`, `apps/api/prisma/migrations/**` — legacy Node API and
  additive database migrations;
- `supabase/functions/**` — production Edge API and reminder worker;
- `packages/shared/**` — contracts shared by web and API.

CI/deploy files are deliberate infrastructure changes:

- `.github/workflows/ci.yml` — validation only;
- `.github/workflows/deploy-staging.yml` — staging deploy;
- `.github/workflows/deploy-production.yml` — guarded production deploy;
- `.github/workflows/rollback-production.yml` — forward-compatible rollback;
- `scripts/ci/**` — CI/smoke checks;
- `supabase/sql/**` — database jobs such as Cron, only with an explicit
  operational change.

Do not commit secrets or local tooling/data: `.env*` (except `.env.example`),
database URLs/passwords, JWT/JOBS/VAPID private keys, Google client secrets,
Cloudflare/Supabase tokens, Telegram/BotFather tokens, service-role keys,
`apps/mobile/**`, `.export-prod/**`, `artifacts/**`, `.agents/**`, `.codex/**`,
`.claude/**`, `AGENTS.md`, `CLAUDE.md`, `docs/agents/**`, screenshots, logs, or
local database files. Public frontend configuration such as `VITE_API_URL` is
not a secret, but it must still be set through the GitHub Environment variable,
not hard-coded in source.

Required secret placement:

- GitHub Environment `staging`/`production`: deploy token, migration URL,
  Cloudflare API token, job secret, and other CI-only credentials;
- Supabase project secrets: runtime `JWT_SECRET`, `JOBS_SECRET`, VAPID keys,
  Google/Telegram credentials and other server-only values;
- GitHub Environment variables (not secrets): project refs/API URLs, Pages
  project/account IDs, `PAGES_URL`, `VITE_API_URL`, and enable flags.

## CI lanes

`.github/workflows/ci.yml` runs on pull requests and pushes to `main`:

1. `lint-typecheck`: generate Prisma client, build shared packages, lint API
   and web.
2. `unit`: shared, API, and web tests against an isolated Postgres database.
3. `build-bundle`: build the API and web bundles and check the web bundle exists.
4. `edge-db`: start local Supabase, apply migrations, serve both Edge entry
   points, then run the local smoke and dependency checks.
5. `contract`, `e2e`, and `security`: verify entry points/migrations, browser
   behavior, dependency risk, and tracked-secret guards.

Do not skip a failed lane by deploying manually. Fix the lane or explicitly
rollback to a known-good SHA.

## Build and deploy paths

### Web (FE)

The production web build is:

```bash
pnpm --filter @mindoist/design-tokens build
pnpm --filter @mindoist/shared build
pnpm --filter @mindoist/web build
```

Output is `apps/web/dist`. CI/deploy uploads that directory to Cloudflare
Pages: branch `staging` for staging and branch `main` for production. The
custom domain is attached only by the production workflow.

### Node API (legacy/local validation)

For API TypeScript and Prisma validation:

```bash
pnpm --filter @mindoist/api prisma generate
pnpm --filter @mindoist/api build
pnpm --filter @mindoist/api test
```

The Node bundle is `apps/api/dist`; it is not the production server after the
Supabase cutover. Do not deploy `apps/api/dist` to Pages.

### Production backend (Edge)

Production backend behavior is in `supabase/functions/api/**` and
`supabase/functions/_shared/**`. A backend change must pass the `edge-db` lane
and is deployed by:

```bash
supabase functions deploy api --project-ref "$SUPABASE_PROJECT_REF" --no-verify-jwt
supabase functions deploy jobs-reminders --project-ref "$SUPABASE_PROJECT_REF" --no-verify-jwt
```

Keep the Node API and Edge contract aligned when the endpoint exists in both
places. Apply Prisma migrations through the session-pooler migration URL before
using a new column.

## Reminder worker and calendar alerts

`supabase/functions/jobs-reminders/index.ts` is the production worker. It
handles manual task reminders, task deadlines, countdown due alerts, and early
countdown alerts. It uses an atomic claim, a 24-hour stale window, timezone
fallback, retry-on-delivery-failure, and dedupe keys.

The worker is invoked by Supabase Cron with `x-job-secret`. The deploy workflows
deploy the function but intentionally do **not** modify Cron. Any Cron change
must be reviewed and applied separately in Supabase. The checked-in
`supabase/sql/configure-sf0-cron.sql` is a staging probe; do not run it against
production unchanged and never put a secret in that file.

The web push subscription flow is in
`apps/web/src/lib/push-notifications.ts` and
`apps/web/src/components/NotificationPermissionPrompt.tsx`. Browser permission
and a configured VAPID key are required before a user can receive web alerts.

## Push, PR, and release checklist

```text
[ ] Start from origin/main; create one short-lived branch
[ ] Change only the owning product/Edge files and add focused tests
[ ] Update CHANGELOG.md in the same commit as a feature/fix
[ ] Run the smallest relevant local check; let GitHub run the full CI matrix
[ ] Push branch and open PR into main
[ ] Merge only the exact SHA with all required CI checks green
[ ] Confirm staging deploy + smoke passed
[ ] Production: dispatch deploy with that exact SHA and the safety confirmation
[ ] Verify Pages/API smoke and deployment manifest
[ ] Delete the merged remote and local branch
```

The deployment workflows expect these protected values by environment:
`SUPABASE_ACCESS_TOKEN`, `MIGRATION_DATABASE_URL`,
`CLOUDFLARE_API_TOKEN`, `STAGING_SF0_JOB_SECRET` or
`PRODUCTION_SF0_JOB_SECRET`. Runtime `JWT_SECRET`, `JOBS_SECRET`, and VAPID
credentials are synced to Supabase separately; their values must never appear
in workflow output or commits.

Rollback uses `.github/workflows/rollback-production.yml` with a known-good
SHA. It does not run a destructive down migration.
