# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this is

A **CPQ (Configure-Price-Quote) platform for SAP Business One SME manufacturers**. It integrates with SAP B1
**via Service Layer (OData v4) only**, mines historical ERP data to learn which parameters matter per product
family, and drives **one** configurator framework usable in **manual** mode (dynamic UI + live "similar past
products") and **automated** mode (Claude ingests images/emails/drawings and fills the config) — then writes
quotations back to SAP.

**The load-bearing idea (the backbone):** the manual configurator, the AI agent, and the UI-generation path
all read/write the **same** versioned JSON `framework + state` and pass the **same** `validate(framework, state)`
gate. The AI never generates React — it fills the same state and emits the same uischema the manual renderer
draws. **One model, three consumers, zero drift** — made *structural* by a single browser-safe `@cpq/contract`
package, not by convention.

---

## Status: P0 Foundation — ✅ COMPLETE · P1 SAP Integration — ✅ code-complete · ⏳ LIVE acceptance pending sandbox run

The monorepo boots end-to-end. All 7 P0 acceptance gates are proven with real evidence (see source plan).
P0 pushed to `origin/master`. Current toolchain: **Node 24** (`.nvmrc`; runs on 25+), **pnpm 10.33.4**, Docker.

**P1 = metadata-driven generic SAP CRUD** (on branch `p1-sap-integration`). `@cpq/sap-b1` is **Service-Layer-ONLY**:
it discovers entities from `$metadata` (EDMX parser → `SapMetadata`), gates every operation through a per-tenant
`sap_entity_configs` **allowlist** (migration `0001`), and validates payloads **strictly** against the
metadata-derived shape. Operations: **Read** (list + get, paginated via `@odata.nextLink`), **Create**, **Update**
(PATCH + `If-Match`/ETag optimistic concurrency), **Delete**, and **bound actions** (e.g. `Cancel`/`Close`). This is
the **deterministic, non-AI commit path** mandated by SAP API Policy §2.2.2. Writes append a **best-effort**
`audit_log` row (fire-and-forget, never fails the write); `slug → uuid` tenant resolution backs the allowlist + audit;
`resolveSapConfig` assembles config from env + the `/run/secrets/sap_password` file-secret.
**Accept:** the LIVE acceptance suite (`packages/sap-b1/test/live.acceptance.test.ts`) drives metadata refresh →
BusinessPartners create/get/update/delete → Quotation create → `Cancel`. It is **env-gated** (`skipIf(!SAP_BASE_URL)`):
set `SAP_BASE_URL`/`SAP_COMPANY_DB`/`SAP_USERNAME` + the `/run/secrets/sap_password` secret, then `pnpm -F @cpq/sap-b1 test`.
**Not yet run in this repo** (no sandbox creds present) — the **hermetic** suite is fully green (79 tests; the live suite
skips). Running the live round-trip against the sandbox is the **final P1 acceptance step**.

**Verified evidence (2026-06-01):** whole-repo gate `pnpm turbo run typecheck lint test build` → **44/44**;
`@cpq/sap-b1` **76 hermetic tests** (undici `MockAgent` + loopback `http.Server` + static EDMX fixture, zero network)
plus **3 skipped** live; migration `0001` applies **idempotently on a fresh pgvector volume** on top of `0000`
(grep-gate: `vector_cosine_ops` only in `0000`); the `contract → sap-b1` eslint boundary **bites** (verified by a
temp import → lint fail → revert); `@cpq/db` allowlist/tenant repos green against a live PG, skip cleanly without
`DATABASE_URL`. 20 task commits on `p1-sap-integration` + a holistic-review fix (`If-Match:*` ETag fallback).

> **P2-UI seam (emits now):** `describeEntity` already emits a **JSON Schema (draft 2020-12)** per entity set —
> the shape the P2 builder/manual-renderer will consume. The seam is live; the UI that reads it is P2.

**Workspace graph** (11 projects; pnpm + Turborepo + TS project references + `eslint-plugin-boundaries`):

| Package | Role | Key deps |
|---|---|---|
| `@cpq/contract` ★ | **Single source of truth**: Zod v4 meta-schema, `ConfigState`, isomorphic `validate()` gate, oRPC contract, `canonicalize`/`hashFramework` | `@orpc/contract`, `zod`, `@cpq/constraint-engine`, `@cpq/expr` |
| `@cpq/constraint-engine` | Pure AC-3 finite-domain solver (zero deps, isomorphic) | — |
| `@cpq/expr` | Hardened mathjs formula compiler (CVE floor 15.2.0) | `mathjs` |
| `@cpq/core` | Pure root (ids/Result/errors) + `/server` entry (ALS request-context, pino) | `pino` |
| `@cpq/db` | Drizzle pg schema + pgvector HNSW + advisory-locked migrator + `withTenant` | `drizzle-orm`, `postgres` |
| `@cpq/configurator` | `publish` (hash+validate); ZEN decision-table stub (P2) | `@cpq/contract` |
| `@cpq/sap-b1` | **Metadata-driven SL client**: undici `CookieAgent` + single-flight relogin, EDMX→`SapMetadata`, `describeEntity`→JSON Schema, strict validator, generic CRUD + bound-action gateway, per-tenant registry | `undici`, `http-cookie-agent`, `tough-cookie`, `p-retry`, `fast-xml-parser`, `zod` |
| `@cpq/ai` | Anthropic wrapper + `toStructuredFormat` (P4-ready) | `@anthropic-ai/sdk`, `zod` |
| `@cpq/similarity` | Tested pure Gower + `Embedder` interface (P3-ready) | — |
| `apps/api` | Fastify 5 + oRPC dual handler + ALS `onRequest` + `/healthz` | `fastify`, `@orpc/server`, `@orpc/openapi`, `@orpc/zod` |
| `apps/web` | React 19 + Vite 8 + TanStack Router/Query + UI5 + typed oRPC client + JSONForms↔UI5 renderer seam | (see `apps/web/package.json`) |

`services/analysis-sidecar/` (Python) is deferred to P3 (compose profile stub only).

---

## Commands

```bash
pnpm install --frozen-lockfile          # install (CI uses --frozen-lockfile)
pnpm turbo run typecheck lint test build # the whole-repo gate (== CI)
pnpm -F @cpq/<pkg> test|build|lint|typecheck   # one package
node scripts/check-forbidden-deps.mjs    # CVE/supply-chain policy gate

# Apps (dev)
pnpm -F @cpq/api dev                     # Fastify on :3000 (tsx watch)
pnpm -F @cpq/web dev                     # Vite on :5173 (proxies /rpc,/api -> :3000)

# DB
pnpm -F @cpq/db db:generate              # generate migration from schema (NEVER push)
DATABASE_URL=postgres://... pnpm -F @cpq/db db:migrate   # advisory-locked, idempotent

# Full stack (acceptance #1)
echo 'somepassword' > docker/secrets/db_password   # gitignored; required before up
docker compose -f docker/compose.yml up -d --build --wait
# web :8080 (Caddy SPA + reverse-proxy), api :3000, one-shot migrate, db (pgvector)
```

`@cpq/contract` runs tests under **two Vitest projects** (`node` + `jsdom`) to prove `validate()` isomorphism.

---

## Architecture essentials

- **`@cpq/contract` is a browser-safe graph leaf.** Its only runtime deps are `@orpc/contract`, `zod`, and the
  two *pure isomorphic* logic packages. This is what lets the **literal same `validate()` import** run in Node
  and the browser. Never add a UI/DB/SAP/Node-only dep here.
- **`validate()`** = field/type/domain/range checks → AC-3 domain narrowing (`narrowedDomains`, enum fields
  only) → mathjs formulas (`derived`). ZEN decision tables are **backend-only (P2)** and merge into `derived`
  server-side; the `derived` *shape* is locked now.
- **oRPC dual surface, one router:** `apps/api` `implement()`s the contract once. `RPCHandler` serves `/rpc/*`
  (typed client, oRPC envelope — not plain JSON). `OpenAPIHandler` serves `/api/*` plain-JSON REST for n8n;
  spec at **`/api/spec.json`** (OpenAPI 3.1.1), Scalar UI at **`/api/`**.
- **Request context = ALS, not Fastify decorators.** `@cpq/core/server` owns `AsyncLocalStorage`; the API binds
  it in an `onRequest` hook (`bindContext`); handlers + repos read via `getContext()`. ALS does **not** cross
  process boundaries — re-pass `tenantId` into SAP sessions / webhooks / jobs.
- **Boundary rule (structural):** `apps/web` may import `@cpq/contract` + `@cpq/core` (root) + the oRPC *client*
  only — **never** `@cpq/db`, `@cpq/core/server`, or `@orpc/server*`. Enforced by `eslint-plugin-boundaries` +
  `no-restricted-imports` + not declaring those deps + `noUncheckedSideEffectImports`.

---

## Conventions & gotchas (read before editing — these cost real time to rediscover)

- **TDD + Conventional Commits.** Write the failing test, see red, implement, green, commit. Commit per task.
- **`typecheck` = `tsc --noEmit`** (NOT `tsc -b --noEmit`). `-b --noEmit` propagates `--noEmit` to referenced
  composite projects and errors **TS6310**. Turbo's `typecheck` `dependsOn: ["^build"]`, so deps' `dist` exist
  for resolution. `build` = `tsc -b`.
- **NodeNext requires `.js` extensions** on relative imports in `src/` (`export * from './ac3.js'`). Test files
  are *not* in `tsc`'s `include`, so they use extensionless imports (Vitest resolves them).
- **`apps/web` uses `moduleResolution: "Bundler"`** (overrides the base `NodeNext`) and is **not** in the root
  `tsconfig.json` solution graph — it's Vite-built and typechecked standalone (`tsc --noEmit`).
- **Drizzle: `generate` only, never `push`** (push drops the HNSW `vector_cosine_ops` op class). The first
  migration **hand-prepends `CREATE EXTENSION IF NOT EXISTS vector;`**. Grep-gate `vector_cosine_ops` before
  commit. `migrate.ts` resolves its migrations folder via `import.meta.url` (CWD-independent — Docker runs it
  from repo root). Current migration: `packages/db/drizzle/0000_rainy_zeigeist.sql`.
- **pnpm 10 blocks dependency build scripts by default** — allowlist via `onlyBuiltDependencies` in
  `pnpm-workspace.yaml` (currently `esbuild`, `@gorules/zen-engine`).
- **`.dockerignore` must exclude `*.tsbuildinfo`** (they sit at package root, *outside* `dist/`). A stale
  buildinfo copied into the image makes the container's `tsc -b` skip emit → empty `dist` → bundler can't
  resolve `@cpq/*`.
- **Caddy uses `handle` blocks** (`docker/Caddyfile`) so the SPA `try_files` fallback doesn't swallow the
  `/rpc`,`/api` reverse-proxy routes. Dev parity = the Vite `server.proxy`.
- **AC-3 re-enqueues ALL incident arcs** (no reverse-arc exclusion). The textbook optimization is *unsound*
  with multiple constraints on one variable pair (a framework can have that) — it terminated non-arc-consistent
  with a false `consistent:true`. Don't "optimize" it back.
- **`@cpq/expr` `evaluate()` validates a finite number** before returning — a formula yielding a string/Infinity
  becomes a `validate()` formula *issue*, never a poisoned `derived` value.
- Secrets are **files in tmpfs** (`/run/secrets/*`), assembled into `DATABASE_URL` at runtime — never baked into
  the image or compose env (note the `$$` escaping in `compose.yml`).
- **Dependency policy** (`scripts/check-forbidden-deps.mjs`, enforced in CI): forbids `expr-eval`,
  `expr-eval-fork`, `b1-service-layer`, and `mathjs < 15.2.0`.

**Deviations from the source plans** (deliberate, toward correctness/honesty): stub deps trimmed to what P0
imports (`openai`, `@gorules/zen-engine`, `undici`/`http-cookie-agent`/`p-retry`, `drizzle-zod`,
`@huggingface/transformers` deferred to their wiring phase); added `@types/node`, `typescript-eslint`,
`@orpc/contract` (source manifest under-specified); used `OpenAPIReferencePlugin` instead of
`@scalar/fastify-api-reference` (per the P0 plan's verified correction); the `@cpq/ui-renderers` package is
deferred — the P0 renderer seam lives in `apps/web/src/renderers/`.

---

## Implementation roadmap (P1 → P5)

Source of truth: `~/.claude/plans/claude-plans-objective-i-want-sharded-p-piped-eich.md`. Sequencing de-risks
SAP integration and the configurator core early. **A SAP B1 sandbox is available, so P1 runs LIVE.**

> **⚠️ Hard architectural constraint for P4 (SAP API Policy v4/2026 §2.2.2):** autonomous/generative AI may
> **not** plan or execute SAP API call sequences. The AI configurator operates only on **our Postgres
> projection**; a **deterministic, non-AI code path** (in `@cpq/sap-b1`, invoked by an oRPC procedure) commits
> to Service Layer, gated by HITL. Bake this boundary into every SAP-touching design.

### P1 — SAP integration (de-risk first, LIVE)
Flesh out `@cpq/sap-b1`: `b1s/v2` login → B1SESSION+ROUTEID jar → single-flight re-login on 401/"session
timeout" → keep-alive timer. Read `Items`/`BusinessPartners`/`BOM` (paginate via `@odata.nextLink`);
`SQLQueries` cross-DB joined reads (MSSQL+HANA; `SELECT *` disallowed); **create a Quotation end-to-end**
against the demo B1. Hand-rolled over `undici` + `http-cookie-agent` + `tough-cookie` + `p-retry` + Zod DTOs
(no maintained SDK — `b1-service-layer` is forbidden).
**Accept:** round-trip read + a Quotation written to the sandbox.
**✅ Delivered** (branch `p1-sap-integration`) — redesigned as **generic, metadata-driven** CRUD rather than typed
per-entity gateways: discovers entities from `$metadata`, per-tenant `sap_entity_configs` allowlist, strict
metadata-derived validation, PATCH+`If-Match`/ETag, bound actions, deterministic §2.2.2 commit path, best-effort
`audit_log`, `describeEntity`→JSON Schema for the P2 UI. **Hermetic suite green; the LIVE round-trip above is
pending a sandbox run** (env-gated `live.acceptance.test.ts`). *Deferred:* `SQLQueries` cross-DB (MSSQL+HANA) reads —
not required by the metadata-driven entity-CRUD acceptance; revisit if a join-only read is needed.
**P0 left ready:** `SapClient` (cookie jar + tested single-flight re-login + `SessionSchema` DTO boundary).

### P2 — Configurator core (the strong point)
Flesh out the framework JSON model + Zod meta-schema + **immutable content-hashed versioning**; the full
engine (mathjs formulas + **ZEN decision tables** + AC-3 propagation, incl. **n-ary `allowedCombo` >2 fields**);
the JSONForms↔UI5 manual **renderer toolkit** (ComboBox/MultiComboBox/AnalyticalTable, `e.detail` payloads,
spurious-`onChange` guard, editable AnalyticalTable); the **builder UI** (driven by
`frameworkJsonSchema()` → JSONForms).
**Accept:** author a tiny framework → configure it manually → produce a SAP quotation from a manual config.
**P0 left ready:** `validate()` gate, `publish()` hash+validate, `frameworkJsonSchema()`, the one-renderer seam
(`apps/web/src/renderers/`), `zen.ts` stub, `framework_versions` (content-hash PK, repo-enforced immutability),
`decisionTables` shape + `derived` shape locked.

### P3 — Analysis + similarity
Historical read-model backfill (incremental Service Layer sync); the Python **analysis-sidecar** (permutation +
mutual-info + tree-SHAP ensemble) → `parameter_rankings`; hybrid similarity (**pgvector HNSW recall →
importance-weighted Gower re-rank**); live "similar past products" as the user types. Pick the air-gapped local
embedding default here (prefer 768-dim BGE/GTE; `@huggingface/transformers`, NOT `@xenova/transformers`).
**Accept:** live suggestions ranked by learned importance.
**P0 left ready:** tested `gower()`, `Embedder` interface (`dims=1536` default identity), `item_embeddings` HNSW
table (`vector_cosine_ops`), `services/analysis-sidecar/` scaffold + compose profile.

### P4 — Automated AI configurator
Claude agent loop (Messages API): multimodal ingest → structured outputs bound to the **same** schema → tools
(`validate_config`/`search_similar`/`read_projection`) → clarifying questions → server-driven UI (same
uischema) → **two-step HITL** → **deterministic** SAP commit (per §2.2.2). Manual⇄auto switching mid-flow via
shared `ConfigState` + `provenance`. Per-customer Anthropic key/workspace; manual mode must degrade gracefully
with **no** key.
**Accept:** a sample drawing → AI fills → `validate()` → HITL confirm → quotation; a bad fill is gated.
**P0 left ready:** `@cpq/ai` (`createAiClient`, `toStructuredFormat` binding the same Zod schemas), `ConfigState`
with `provenance` (`manual|ai|suggested|locked`), `configurations.mode` (`manual|ai`).

### P5 — Automation + SaaS hardening
Stable webhook/event/REST surface; n8n decoupled (Sustainable-Use license → Embed-License gate for SaaS; keep
the webhook contract swappable — Temporal/Windmill); promote tenant isolation to **Postgres RLS** (`SET LOCAL
app.tenant_id` on a non-BYPASSRLS role + `pgPolicy` + PgBouncer txn-pool); outbound **Cloudflare Tunnel**
reach-on-prem (egress-only); Infisical secrets.
**Accept:** a sales-to-production automation runs via our webhook surface; multi-tenant isolation tests pass.
**P0 left ready:** `withTenant()` (ALS-scoped, pass-through now), `audit_log` (append-only + `requestId`),
file-based secrets, `cloudflared`/`n8n` compose profiles, the headless OpenAPI surface for n8n.

---

## Source plans (reference)

- `~/.claude/plans/make-an-executable-plan-prancy-codd.md` — the P0 executable plan (implemented here).
- `~/.claude/plans/claude-plans-objective-i-want-sharded-p-piped-eich.md` — the full P0→P5 architecture strategy
  + decision deltas (oRPC vs tRPC, CVE pins, SAP §2.2.2, etc.).
- `INITIAL-SPEC.md` — product spec.
