# Portal Warga Palm Village - Agent Readiness Checklist

> Purpose: catatan kebutuhan untuk AI agent/developer yang akan menjalankan, memvalidasi, dan melanjutkan production upgrade.
>
> Scope: local development, production implementation, required credentials, optional MCP/connectors, and authentication access.
>
> Related documents:
> - `docs/production/PLANNING.md`
> - `docs/production/REQUIREMENTS.md`
> - `docs/production/TASKLIST.md`

---

## 1. Current Project Shape

Repository root used by current workspace:

```text
PortalPalmVillage/
```

Main frontend:

```text
client/
```

Important files:

```text
package.json
client/package.json
client/.env.example
client/vite.config.js
client/src/context/AuthContext.jsx
client/src/services/supabaseClient.js
supabase/schema.sql
docs/production/PLANNING.md
docs/production/REQUIREMENTS.md
docs/production/TASKLIST.md
```

Legacy backend:

```text
legacy-backend/
```

Status:

- `legacy-backend/` exists but is not the target production backend.
- Target production backend is n8n.
- Supabase remains the production database and storage layer.

Known URLs:

- Local frontend: `http://localhost:5173`
- Temporary production frontend: `https://portal-warga.vercel.app/`
- Final custom production domain: not frozen yet.

---

## 2. What Is Needed to Run Locally

### 2.1 Required Local Tools

| Tool | Required | Notes |
| --- | --- | --- |
| Node.js | Yes | Root `package.json` requires `>=18` |
| npm | Yes | Used by existing scripts |
| Git | Yes | Needed for normal development workflow |
| Browser | Yes | App is a Vite React PWA |
| PowerShell or shell | Yes | Current workspace uses PowerShell |

### 2.2 Install Dependencies

From project root:

```bash
npm --prefix client ci
```

or if lockfile state requires normal install:

```bash
npm --prefix client install
```

### 2.3 Run Local Dev Server

From project root:

```bash
npm run dev
```

Expected dev server:

```text
http://localhost:5173
```

### 2.4 Build

From project root:

```bash
npm run build
```

Expected output:

```text
client/dist/
```

### 2.5 Local Demo Environment

Minimum `client/.env` for demo mode:

```env
VITE_DEMO_MODE=true
```

Demo mode does not require Supabase, n8n, Google OAuth, or Midtrans.

---

## 3. Current Environment Variables

### 3.1 Existing Frontend Env Vars

Found in `client/.env.example`:

```env
VITE_DEMO_MODE=true
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

### 3.2 Required New Frontend Env Vars for Production Upgrade

These are not fully wired yet, but are required by the production plan:

```env
VITE_DEMO_MODE=false
VITE_N8N_API_BASE_URL=https://api.example.com/webhook/portal-v1
VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
VITE_APP_ENV=staging
```

Notes:

- `VITE_*` variables are public in the built frontend.
- Never put secrets in `VITE_*`.
- `VITE_SUPABASE_ANON_KEY` is public-safe, but the production direction is for critical writes to go through n8n.

### 3.3 Sensitive Env Files Found

The repo currently has local env files:

```text
client/.env
legacy-backend/.env
```

Agent rule:

- Do not print their contents unless explicitly asked.
- Do not commit them.
- Do not copy secrets into documentation.

---

## 4. Required Authentication and External Access

### 4.1 Google OAuth

Required for production login.

Agent/developer needs:

- Google Cloud project access.
- OAuth 2.0 Web Client ID.
- Authorized JavaScript origins:
  - local dev origin if testing Google locally.
  - staging frontend domain.
  - production frontend domain.
- Authorized redirect URIs if the chosen Google flow requires redirects.

Frontend needs:

```env
VITE_GOOGLE_CLIENT_ID=...
```

n8n needs:

```env
GOOGLE_CLIENT_ID=...
```

Production rule:

- User login only uses Google Account.
- Frontend receives Google ID Token.
- n8n validates Google token.
- n8n issues App JWT.

### 4.2 App JWT

n8n needs:

```env
APP_JWT_SECRET=...
APP_JWT_ISSUER=portal-palm-village
APP_JWT_AUDIENCE=portal-palm-village-web
```

Agent/developer needs:

- Access to n8n environment/credential settings.
- Agreement on token expiry and storage strategy.
- n8n `JWT` credential named `PV App JWT`.

Default recommendation:

- Short-lived Bearer JWT first.
- Consider HttpOnly cookie later if n8n/domain setup supports it cleanly.

### 4.3 Supabase

Agent/developer needs:

- Supabase project dashboard access for staging and production.
- SQL Editor access or Supabase CLI access.
- Ability to create storage buckets.
- Ability to manage service role key in n8n only.

Frontend may need:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

n8n needs:

```env
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Security rule:

- `SUPABASE_SERVICE_ROLE_KEY` must never be exposed to frontend.

Current n8n credential check on 2026-07-08:

- `PV App JWT` exists as `jwtAuth` and is usable for HS256 App JWT verification.
- `PV Supabase Service Role` exists as `supabaseApi` and can load Portal Palm Village Supabase tables.
- `Supabase account` existed but failed connection with a host/domain error.
- `Supabase Account NARA` connected but appears to target another project and must not be used for Portal Palm Village.
- `PV API - Auth Me` was created and published with these credentials.
- `PV API - Role Check Test` was created and published with these credentials.
- `PV API - Audit Log Test` was created and validated, then unpublished because it is a write-test endpoint.
- Phase 2 temporary signer workflow was archived after validation.
- Phase 2 temporary Supabase test rows were cleaned up and verified as remaining count `0`.
- Do not use old/non-Portal Supabase credentials for new Portal workflows.

### 4.4 n8n

Agent/developer needs:

- n8n owner/editor access.
- Ability to create webhook workflows.
- Ability to create credentials.
- Ability to configure env vars.
- Ability to export/import workflows for backup.
- Google Drive credential in n8n for payment proof uploads if using the zero-monthly-cost file strategy.

Production n8n requirements:

- Stable `N8N_ENCRYPTION_KEY`.
- n8n internal DB should be Postgres for production.
- Separate staging and production n8n instances or at least separate workflow/env configuration.

### 4.5 Midtrans

Required for QRIS production phase.

Agent/developer needs:

- Midtrans sandbox access.
- Midtrans production access later.
- Server key.
- Client key if needed.
- Ability to set payment notification/webhook URL.

n8n needs:

```env
MIDTRANS_SERVER_KEY=...
MIDTRANS_CLIENT_KEY=...
MIDTRANS_ENV=sandbox
```

Security rule:

- Webhook handler must validate Midtrans signature.
- Duplicate webhook must be idempotent.

### 4.5.1 Google Drive for Payment Proof Files

Required for the current zero-monthly-cost file strategy.

Agent/developer needs:

- A Google Drive account/folder owned by the operator or organization.
- n8n Google Drive credential with permission to upload files and set file sharing.
- A private parent folder for app files.

Rules:

- Only individual proof files may be set to "anyone with the link can view".
- Parent folders must not be publicly browsable.
- Supabase stores the Drive file id and view URL.
- Do not store Google Drive OAuth secrets in frontend env vars.

### 4.6 Notification Provider

Optional until automation phase.

Possible providers:

- Fonnte
- Wablas
- SMTP email provider

n8n may need:

```env
WA_PROVIDER_API_KEY=...
SMTP_HOST=...
SMTP_USER=...
SMTP_PASS=...
```

Rule:

- Notification failure must not rollback completed payment.

### 4.7 Vercel

Agent/developer needs:

- Vercel project access.
- Ability to set frontend env vars.
- Ability to deploy preview/staging/production.

Current Vercel config:

```json
{
  "installCommand": "npm --prefix client ci",
  "buildCommand": "npm --prefix client run build",
  "outputDirectory": "client/dist",
  "framework": "vite"
}
```

---

## 5. MCP / Connector Needs

### 5.1 Required to Run Local Demo

No MCP is required to run the current local demo.

Minimum local requirement:

- shell access
- Node.js/npm
- browser

### 5.2 Recommended MCP / Connectors for Production Implementation

These are recommended for AI agents if available. They are not strictly required, but they reduce manual dashboard work and mistakes.

| Capability | Priority | Why |
| --- | --- | --- |
| Supabase MCP or Supabase CLI access | High | Apply/read schema, inspect tables, validate policies, manage storage |
| n8n API/MCP or n8n workflow export access | High | Create/update workflows, inspect executions, manage webhook contracts |
| Browser automation / Playwright | Medium | Validate UI login, approval, payment matrix, reports |
| Vercel connector/API access | Medium | Inspect deploys, env vars, preview URLs |
| GitHub connector/API access | Medium | PR review, CI status, commit history, issue tracking |
| Midtrans dashboard/API access | Medium | Validate sandbox transactions and webhook config |

### 5.3 MCP Not Required Initially

The agent can start Phase 0 and documentation work without MCP.

For coding tasks before live integration, the agent can work with:

- local files
- shell commands
- existing docs
- mocked/demo mode

### 5.4 When External Access Becomes Blocking

External access becomes required at these phases:

| Phase | Access Needed |
| --- | --- |
| Phase 1 | Supabase project or local SQL validation |
| Phase 2 | n8n editor/API access |
| Phase 3 | Google OAuth client ID and n8n auth workflow access |
| Phase 8 | Midtrans sandbox credentials and webhook URL |
| Phase 12 | Vercel, staging Supabase, staging n8n |
| Phase 13 | Production Vercel, production Supabase, production n8n, production Midtrans |

---

## 6. Agent Execution Prerequisites by Phase

### Phase 0 - Architecture Freeze

Agent can proceed with local repo only.

Needed:

- Read/write docs.
- User decisions for URLs/domains and JWT storage strategy.

### Phase 1 - Supabase Production Contract

Agent can draft SQL locally.

To validate fully, agent needs:

- Supabase dashboard/SQL access, or
- local Postgres/Supabase CLI setup.

### Phase 2 - n8n API Foundation

Status:

- Complete as of 2026-07-09.
- Standard response, App JWT verification, current-profile loading, minimum-role check, and audit-log insert patterns are documented and validated.
- Reusable docs:
  - `docs/production/N8N_STANDARD_RESPONSE.md`
  - `docs/production/N8N_APP_JWT_VERIFICATION.md`
  - `docs/production/N8N_ROLE_CHECK_PATTERN.md`
  - `docs/production/N8N_AUDIT_LOG_PATTERN.md`

Agent needs for future Phase 2-style workflow work:

- n8n editor access, or
- permission to create workflow JSON specs locally for manual import.

### Phase 3 - Google Login and App JWT

Agent needs:

- Google OAuth Client ID.
- n8n workflow access.
- JWT secret in n8n env.
- Staging frontend URL if testing real Google login.

### Phase 4 - Approval and User Management

Agent needs:

- Supabase staging data.
- n8n protected endpoints.
- frontend production-mode env.

### Phase 5-7 - API Migration, Billing, Manual Payment

Agent needs:

- n8n endpoints available.
- Supabase service role in n8n.
- Google Drive credential in n8n for payment proof uploads.
- Supabase Storage bucket access only if fallback storage is used.

### Phase 8 - Midtrans QRIS

Agent needs:

- Midtrans sandbox keys.
- Public n8n webhook URL reachable by Midtrans.
- Ability to configure notification URL in Midtrans dashboard.

### Phase 9-10 - Reports and Automation

Agent needs:

- Enough staging data for reports.
- Notification provider credentials if implementing WA/email.

### Phase 12-13 - Staging and Production

Agent needs:

- Vercel access.
- Supabase staging/production access.
- n8n staging/production access.
- Google OAuth production settings.
- Midtrans production access.

---

## 7. Current Gaps Found

Based on repo inspection:

- No `.agents` folder exists in `PortalPalmVillage/`.
- No `.codex` folder exists in `PortalPalmVillage/`.
- No MCP configuration exists in the repo.
- `client/.env.example` does not yet include:
  - `VITE_N8N_API_BASE_URL`
  - `VITE_GOOGLE_CLIENT_ID`
  - `VITE_APP_ENV`
- Current production docs now target Midtrans, but older README still mentions Mayar in several places.
- Current `AuthContext.jsx` still uses demo/Supabase password-style auth path; production plan requires Google ID Token -> n8n -> App JWT.
- Current `supabaseClient.js` exists and is used; production plan should gradually move critical operations to n8n API.
- `legacy-backend/` still exists but should not be used for production target unless explicitly revived.

---

## 8. Recommended Immediate Next Actions

1. Update `client/.env.example` with planned production vars:
   - `VITE_N8N_API_BASE_URL`
   - `VITE_GOOGLE_CLIENT_ID`
   - `VITE_APP_ENV`
2. Add a short note in README that production backend direction is n8n + Supabase, not legacy backend.
3. Decide whether agent will get:
   - Supabase MCP/CLI access,
   - n8n editor/API access,
   - Vercel access,
   - Midtrans sandbox access.
4. Start Phase 0 from `docs/production/TASKLIST.md`.
5. Do not implement QRIS before auth, approval, and role enforcement are production-ready.

---

## 9. Minimal Access Matrix for an AI Agent

| Work Type | Local Files | Supabase | n8n | Google | Midtrans | Vercel |
| --- | --- | --- | --- | --- | --- | --- |
| Documentation | Yes | No | No | No | No | No |
| Frontend demo fixes | Yes | No | No | No | No | No |
| Production schema | Yes | Yes for validation | No | No | No | No |
| n8n API workflows | Yes | Yes | Yes | No | No | No |
| Google login | Yes | Yes | Yes | Yes | No | Optional |
| Approval production | Yes | Yes | Yes | No | No | Optional |
| Manual payment | Yes | Yes | Yes | No | No | Optional |
| QRIS Midtrans | Yes | Yes | Yes | No | Yes | Optional |
| Staging launch | Yes | Yes | Yes | Yes | Yes | Yes |
| Production launch | Yes | Yes | Yes | Yes | Yes | Yes |
