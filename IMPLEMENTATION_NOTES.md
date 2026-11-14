# CROX implementation notes

This update is an incremental repair and hardening pass over the supplied CROX codebase. It deliberately retains the existing React/Vite application, Express services, SQLite database/migrations, authentication, encrypted credentials, workflows, webhooks, scheduler, execution history, integrations, and NOVA modules.

## Implemented in this update

- Fixed the Multi-Agent starter workflow's Orchestrator configuration to use the fields consumed by the validator and execution engine, and aligned its default goal with the Manual Trigger payload.
- Enabled the Agent Orchestrator to render AI sub-node ports and accept model, memory, tool, and parser connections through the same typed connection rules as an AI Agent.
- Added a regression test for the Multi-Agent starter graph and Orchestrator model edge.
- Improved node-picker discovery using node search aliases, accurate credential badges, and a catalogue-derived search count.
- Corrected global search and node configuration references to the existing AI provider and integration record schemas (`displayName`, `discoveredModels`, `appId`, and `availability`).
- Marked unfinished integrations honestly in the configuration panel instead of suggesting that a catalogue entry is already connected.
- Updated defaults and fallback model choices for newly created workflows to stable Gemini `gemini-3.8-flash` and current Anthropic `claude-sonnet-5-5` / `claude-haiku-5-5` identifiers. Previously saved workflow model IDs are not rewritten; the editor retains an existing saved model option if it is not in the current discovery list.
- Moved Code Node execution out of the Express process into a separate Node child process. The worker receives JSON inputs only, applies the Node Permission Model, limits code/input/output size, bounds execution time and concurrency, and does not expose process/require/fetch APIs to the VM context.
- Added Code Node regression tests for normal JSON transforms, process/module escape attempts, and infinite loops.
- Made the production start and clean scripts cross-platform, added `tsx` to production dependencies, and declared Node.js 22.13+ as the runtime requirement for the permission-restricted Code Node worker.
- Hardened outbound HTTP across credentials, workflows, AI provider calls, AI tools, and supported integrations: validate URLs before each request, reject embedded URL credentials, block additional internal IPv6 forms, and disable automatic redirects to prevent redirect-based SSRF.
- Added production startup checks for valid port configuration, a stable credential-encryption key, and an existing frontend build; invalid production setups now fail with an actionable error instead of starting in a broken state.
- Added centralized Express API error handling for oversized and malformed request bodies, and only trust a reverse proxy in production.
- Updated the project README to describe the current architecture and known implementation limitations accurately.

## Validation performed

- TypeScript/TSX syntax transpilation: 63 TypeScript/TSX files parsed with zero syntax/transpilation diagnostics.
- Code Node worker was exercised directly with JSON transforms, process/require/fetch absence, constructor-based escape attempts, filesystem access restrictions, and timeout cases.
- SSRF smoke tests passed for IPv4-mapped IPv6 checks, embedded URL credentials, blocked localhost, and redirect rejection.
- `npm install` could not complete because the package registry DNS lookup failed (`EAI_AGAIN`) in this environment. Therefore `npm run lint`, `npm test`, and `npm run build` were not claimed as passed; run them after `npm.cmd install` on your PC.

## Not claimed as completed

This is not the full multi-phase product roadmap in the supplied specification. Full extraction of the large workflow editor and inspector into smaller modules, complete OAuth coverage for every listed provider, every listed app connector/action, distributed execution/scheduling, hardened OS/container isolation for arbitrary untrusted code, end-to-end browser QA, and complete billing/subscription flows remain outstanding. Existing modules and screens should be treated according to their actual connector and execution status; catalogue presence alone does not mean an integration is live.


## Additional implementation completed — 2026-11-14

- Changed the new-install database default and new account/demo account defaults to the CROX premium dark theme. Added migration `005_dark_first_theme_default` to normalize accounts created under the previous light-by-default behavior; the Settings page still supports an explicit light-theme choice after the migration.
- Added an early HTML theme bootstrap and dark surface/color-scheme defaults to prevent a white flash before React initializes.
- Added the missing `.env.example` referenced by the README and a `.gitignore` for environment secrets, local database files, generated development keys, dependency folders, build output, and logs.
- Added a small fixed-window rate limiter for registration, login, demo access, and password recovery endpoints. It emits standard rate-limit headers and `Retry-After`. This protection is process-local and is not a substitute for Redis-backed limits in a horizontally scaled deployment.
- Added conservative security headers (MIME sniffing protection, frame denial, referrer policy, permissions policy, and HSTS on production HTTPS requests).
- Changed scheduled workflow dispatch so due jobs are claimed and their next cron occurrence advanced atomically, then run without blocking the scheduler loop. The scheduler uses a configurable concurrency cap (`SCHEDULER_CONCURRENCY`, default 3, maximum 10), a five-minute lock, and a coalescing missed-run policy. This remains a single-instance scheduler, not a durable distributed queue/worker system.
- Removed the unused `SESSION_SECRET` helper and its misleading setup instructions. The current application uses opaque random session tokens stored as hashes in SQLite; `SESSION_SECRET` was not involved in signing or validating those sessions.
- Added regression coverage for dark database defaults, theme mapping, and fixed-window rate limiting.

### Validation for this additional pass

- TypeScript/TSX syntax transpilation passed for all 64 source files using the globally available TypeScript compiler API.
- The rate-limit helper passed a direct runtime smoke test for allowed requests, limit rejection, and window reset.
- The Code Node worker passed `node --check`.
- Full `npm install` timed out in this environment, and `node_modules` was not created. Consequently `npm run lint`, `npm test`, and `npm run build` could not be executed and are not claimed as passing. A direct `tsc --noEmit` attempt is blocked by the missing `vite/client` type package.

### Remaining major roadmap items

The additional changes above do not complete the full supplied specification. Durable execution pause/resume, true downstream loop-body iteration, persisted queue/worker infrastructure, distributed scheduling, full connector/OAuth coverage, full execution event streaming, end-to-end browser testing, deeper editor modularization, and SaaS billing remain incomplete. Keep those limitations visible rather than treating the platform as production-ready.
