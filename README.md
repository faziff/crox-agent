# CROX — Visual Workflow Automation Platform

**Describe it. Build it. Automate it.**

CROX is an existing full-stack workflow automation application with a React visual editor, an Express API, SQLite persistence, encrypted credentials, workflow scheduling, webhooks, execution history, AI provider configuration, app integrations, and the NOVA assistant. The editor uses `@xyflow/react` for its interactive canvas.

## Technology

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, `@xyflow/react`, Lucide React, Motion
- **Backend:** Node.js, Express 4, TypeScript via `tsx`, Google GenAI SDK
- **Database:** SQLite via `better-sqlite3`, with incremental schema migrations
- **Security:** HttpOnly session cookies, bcrypt password hashing, endpoint-specific in-process authentication rate limits, baseline security headers, AES-256-GCM credential encryption, SSRF checks with redirect blocking, permission-restricted Code Node worker
- **Tests:** Vitest

## Prerequisites

- **Node.js 22.13 or newer** (required by the isolated Code Node runtime and Node Permission Model)
- **npm 10 or newer**

## Install and configure

```bash
npm install
```

Copy `.env.example` to `.env` and configure server-side secrets. Never put provider keys in frontend source or browser storage.

Important environment variables:

- `GEMINI_API_KEY`: optional server-side Gemini key used by NOVA and Gemini model operations.
- `CREDENTIAL_ENCRYPTION_KEY`: encryption master key; required in production. Use a strong random value and keep it backed up securely.
- `DATABASE_PATH`: optional SQLite database path; defaults to `./data/crox.db`.
- `PORT`: optional HTTP port; defaults to `3000`.
- `SCHEDULER_CONCURRENCY`: maximum number of scheduled workflows dispatched concurrently in this process; defaults to `3` and is capped at `10`.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`: optional SMTP settings for password-recovery delivery.

The `.env` file and `data/` directory are excluded from version control by `.gitignore`.

## Run

### Windows / PowerShell quick start

```powershell
Copy-Item .env.example .env
npm.cmd install
npm.cmd run dev
```

Open `http://localhost:3000` in your browser. In PowerShell, use `npm.cmd` if the `npm` command is blocked by the local script execution policy. Keep the terminal open while using CROX.

Development (Express API + Vite middleware):

```bash
npm run dev
```

Production build and server:

```bash
npm run build
npm start
```

`npm start` uses a cross-platform TypeScript bootstrap script, sets `NODE_ENV=production`, and starts `server.ts`. `tsx` is a production dependency so the command continues to work when deployment installs production packages only.

Other checks:

```bash
npm run lint
npm test
npm run clean
```

## Main areas

- `src/pages/` — landing page, auth, overview, projects, workflows, templates, credentials, AI providers, integrations, executions, insights, and settings.
- `src/components/workflow-editor/` — canvas nodes, node picker, configuration inspector, execution panel, sticky notes, and group nodes.
- `src/constants/nodeCatalog.ts` — registered node definitions and starter configurations.
- `src/types/workflow.ts` — shared workflow, provider, integration, and execution contracts.
- `server/routes/` — authenticated application API routes.
- `server/services/` — project, workflow, scheduler, provider, AI agent, integration, template, NOVA, and execution services.
- `server/db/database.ts` — versioned SQLite migrations.
- `server/workers/codeSandboxWorker.mjs` — separate restricted process for Code Node snippets.

## Current functionality and honest status

- **Projects:** Project records, user ownership checks, workflow project associations, default Personal project backfill, archive and project management API.
- **Appearance:** Premium dark mode is the default and initial page paint. Existing accounts are migrated to dark mode; users may still explicitly select light mode in Settings.
- **Canvas:** Interactive dotted React Flow canvas, zoom and fit controls, mini-map, custom nodes, a searchable node picker, sticky notes, grouping, undo/redo, and workflow persistence.
- **Workflow structures:** Blank, linear, branching, AI Agent, event-driven, and Multi-Agent starter graphs. AI Agent and Agent Orchestrator support separate typed model, memory, tool, and output-parser attachments.
- **AI Providers:** Backend provider configuration, encrypted key storage, model discovery where supported, connection testing, capability metadata, and explicit provider failover. Provider quota errors do not trigger key cycling to bypass limits.
- **AI Agents:** Agent execution, connected model/tool/memory/output-parser support, bounded tool loops, traces, and persistent memory services.
- **Integrations:** Registry-driven connectors and generic HTTP paths. The Integrations screen differentiates working connectors from connectors that still require implementation or credentials; a catalogue entry is not a claim of a completed app connector.
- **Execution:** Persisted workflow executions and node results, inspection panels, validation, webhook entry points, and execution error reporting. The in-process scheduler dispatches due workflows with bounded concurrency; this is still a single-instance scheduler, not a distributed job queue.
- **NOVA:** Existing workflow assistant remains part of the application.
- **Credentials:** Secrets are stored encrypted by backend services and masked in API responses.
- **Outbound HTTP:** Server-side HTTP calls validate external hosts, reject embedded URL credentials, block private/internal address ranges (including hexadecimal IPv4-mapped IPv6), and do not follow redirects.

## Code Node isolation

Code Node snippets run in a separate child Node process rather than inside the Express application process. The child receives only JSON workflow inputs, starts with a minimal environment, applies Node's Permission Model with only its worker file readable, and enforces snippet, input/output, execution-time, and concurrency limits. The VM context does not expose `process`, `require`, `fetch`, or other network APIs. This requires Node.js 22.13 or newer. This is defense-in-depth process isolation, not a hardened OS/container sandbox; do not pass secrets in workflow data to Code Nodes, and use an OS-level sandbox for arbitrary code from untrusted users.

## Database

The application initializes SQLite and applies pending migrations on server startup. Existing user, workflow, execution, credential, project, memory, provider, integration, and history records are preserved through incremental migrations; do not delete the `data/` directory when upgrading an existing installation.

## Known limitations

- SQLite, in-process authentication rate limits, and scheduler locks are intended for a single application instance. The scheduler dispatches due jobs with bounded concurrency and coalesces missed cron ticks; horizontal scaling needs a shared database/lock design, Redis-backed rate limits, and a distributed scheduler/queue.
- The node registry is broader than the set of fully supported external app actions. Check each integration's availability and authentication status before using it in a live workflow.
- Not all integrations in the requested roadmap are implemented. The UI must continue to mark unfinished connectors as coming soon rather than presenting them as connected.
- The current billing experience does not provide a complete live subscription checkout and entitlement-management flow.
- Production SMTP password recovery requires configured `SMTP_*` variables.
- Full modular extraction of the large workflow editor and configuration inspector, full OAuth connector coverage, complete workflow version restore UX, and full platform-wide QA remain future work.
