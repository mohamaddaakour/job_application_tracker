# Job Application Tracker — Roadmap Overview

> Status: **Phase 05 is next.** Phases 01–04 are complete in the repository.
> Only the current phase has a detailed document. Future phase documents are
> written when you say you are ready for them.

---

## 1. Objective

Build a small, production-style full-stack app in which an authenticated user tracks
the jobs they apply to: create, list, search, filter, paginate, edit, delete, change
status, and see a small statistics dashboard. The specification (`subject.md`) asks for
**depth over feature count**. The goal is correct authentication, authorization,
validation, layering, server-side querying, a sensible split between server state and
client state, and meaningful tests. Extra features are explicitly unwanted.

By the end you should be able to explain every layer and answer the seven "why"
questions at the bottom of `subject.md` from your own code.

---

## 2. Repository assessment (inspected 2026-09-14, branch `auth`)

This is an **existing repository**. The roadmap continues from its real state.

### 2.1 What exists and works

| Area | State |
| --- | --- |
| Layout | Two independent npm packages, `server/` and `client/` (no workspaces, no root `package.json`). |
| Server runtime | Node 22.20, ESM (`"type": "module"`, `module: nodenext`, relative imports end in `.js`). |
| Server tooling | TypeScript 7.0.2 (`tsc --noEmit` passes), `tsx watch` dev server on port 4000. |
| HTTP | Express 5.2.1, `cors` (origin `CLIENT_URL`, credentials), `express.json()`, `cookie-parser`, routes mounted under `/api`. |
| Layering | `routes → controllers → services → prisma` with `asyncHandler`, `AppError`, central `errorHandler`, generic `validate(schema)` middleware. |
| Health | `GET /api/health` runs through every layer and queries the database. |
| Database | PostgreSQL on `localhost:5432`, database `job_application_db`; Prisma 7.10 with `@prisma/adapter-pg`; one migration `20260912141521_init`; `prisma migrate status` reports up to date. |
| Schema (tables `users`, `job_applications` since Phase 04 — see D17) | `User (id uuid, email unique, passwordHash, name, timestamps)` 1—* `JobApplication (company, position, location?, jobUrl?, status enum default APPLIED, appliedAt, notes?, userId FK onDelete Cascade, timestamps, @@index([userId]))`. |
| Auth groundwork | `utils/hash.ts` (bcrypt, 10 rounds: `hash`, `comparePassword`), `utils/jwt.ts` (sign/verify access and refresh tokens, separate secrets) — committed. `schemas/auth.schema.ts` and `types/express.d.ts` — written, not yet committed. |
| Env | `server/.env` has `NODE_ENV, PORT, CLIENT_URL, DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, ACCESS_TOKEN_EXPIRES_IN, REFRESH_TOKEN_EXPIRES_IN`. |
| Client | Vite 8 + React 19.2 + TypeScript ~6.0 + Tailwind 4.3 (via `@tailwindcss/vite`) + ESLint. One placeholder `App.tsx`. `VITE_API_URL=http://localhost:4000/api`. |
| Tests / CI / containers | None. `npm test` in `server/` is the npm placeholder. No CI, no Docker (Docker is excluded by the subject). |

### 2.2 Problems found (verified by running code, not guessed)

| # | Problem | Evidence | Fixed in |
| - | --- | --- | --- |
| P1 | `validate()` crashes on **every valid request**. Express 5 defines `req.query` as a getter with no setter, so `req.query = parsed.query` throws `TypeError: Cannot set property query of #<IncomingMessage> which has only a getter`, which becomes a 500. | Reproduced against the installed Express 5.2.1. | Phase 04 ✅ (fixed with D16, commit `36e4165`) |
| P2 | Malformed JSON bodies return **500** instead of 400, and `console.error` prints the raw body (it could contain a password). | Reproduced: `SyntaxError … type: 'entity.parse.failed'` → 500. | Phase 04 ✅ (`e871505`) |
| P3 | `auth.schema.ts` does not normalise email (so `Alice@x.com` and `alice@x.com` become two accounts). It uses the Zod-4-deprecated `z.string().email()`. It does not stop passwords longer than 72 bytes, which bcrypt silently truncates. | Code reading plus the bcrypt README. | Phase 04 |
| P4 | `jwt.verify` does not pin the algorithm; `env.ts` does not check that the JWT secrets are strong or different from each other. | Code reading. | Phase 05 |
| P5 | `GET /api/health` is public and returns `userCount`, which leaks business information to anyone. | Code reading. | Phase 07 |
| P6 | No automated tests; `DATABASE_URL_TEST` is in `.env.example` but not in `.env`. | Inspection. | Phase 08 |
| P7 | `client/.env` is committed. It contains only a public `VITE_*` URL, so this is not a secret leak, but it is the wrong habit. | `git ls-files`. | Phase 14 |
| P8 | The previous `ROADMAP/` described Express 4, Zod 3, Prisma 5, CommonJS and extensionless imports — none of which match the code — and was deleted from your working tree. | `git show HEAD:ROADMAP/…`. | This roadmap replaces it. |

### 2.3 Accepted as-is (not worth changing)

- `asyncHandler` is redundant in Express 5, which forwards rejected promises by itself. It is harmless and consistent, so we keep using it.
- `server/tsconfig.json` contains leftovers (`jsx`, `declaration`). They are harmless.
- There is no seed script. Tests create their own data, and you create data by hand through the API.

---

## 3. Requirements, assumptions, decisions

### 3.1 Functional requirements (from `subject.md`)

1. Register, login, logout; protected routes; password hashing; access token + refresh token; authentication middleware.
2. `JobApplication` CRUD with fields id, company, position, location, jobUrl, status, appliedAt, notes, createdAt, updatedAt; status ∈ APPLIED, INTERVIEW, REJECTED, OFFER, ACCEPTED.
3. `POST /applications`, `GET /applications`, `GET/PATCH/DELETE /applications/:id`.
4. Server-side search and status filter: `GET /applications?search=&status=`.
5. Server-side pagination: `?page=&limit=` → `{ data, page, limit, total, totalPages }`.
6. `GET /applications/stats` powering a dashboard of simple cards (no charts).
7. Authorization: a user can never read or modify another user's applications, even when they know the id.
8. Frontend: React Router, controlled forms, Zod validation, custom hooks, Redux, TanStack Query, mutations, loading/error states, optimistic UI where appropriate, protected routes.

### 3.2 Non-functional requirements

- **Security:** hashed passwords; short-lived access tokens; refresh tokens JavaScript cannot read; protection against brute-force attacks; safe error responses (no stack traces, no hashes, no request bodies); least-privilege queries (every application query is scoped by `userId`).
- **Correctness:** backend validation of every input, whatever the frontend already checked; database constraints as the final authority.
- **Maintainability:** layered modular monolith; consistent naming; small logical commits.
- **Verifiability:** every phase ends runnable; automated tests from Phase 08 onward protect auth and ownership behaviour.
- **Scope discipline:** nothing from the subject's "do not add" list (admin, email, WebSockets, chat, AI, OAuth, uploads, dark mode, charts, microservices, Docker/Kubernetes, roles).

### 3.3 Assumptions (not specified — recorded instead of asked)

| # | Assumption | If wrong, affects |
| - | --- | --- |
| A1 | Single-user-per-account personal tool; no sharing between users. | 09–13 |
| A2 | Scale is personal: hundreds of applications per user, not millions. | 11–12 (index choices) |
| A3 | Deployment target is a single managed Node host plus managed PostgreSQL (e.g. Render). No Docker. | 23–24 |
| A4 | English UI, no i18n. Dates are stored as UTC timestamps; `appliedAt` is entered as a calendar date. | 09, 20 |
| A5 | You work on Windows; shell examples use **Git Bash** (curl works as expected there; in Windows PowerShell 5.1, `curl` is an alias of `Invoke-WebRequest`). | all |

### 3.4 Implementation decisions (mine — each with the pressure behind it)

| # | Decision | Why |
| - | --- | --- |
| D1 | Keep the existing two-package layout, ports 4000 (API) / 5173 (Vite), and the `/api` prefix. | It works; changing it buys nothing. |
| D2 | Emails are trimmed and lower-cased by Zod; the `User.email` unique constraint (Prisma error `P2002`) is the final guard against duplicates. | Prevents duplicate accounts and the check-then-insert race condition. |
| D3 | Access token: JWT, HS256 pinned, 15 min, returned in the JSON body, kept **in memory only** on the client. | Short blast radius; never persisted where XSS can read it later. |
| D4 | Refresh token: JWT, 7 days, `httpOnly` + `SameSite=Lax` cookie scoped to `path=/api/auth`, `Secure` in production, **rotated** on every refresh. | JavaScript can never read it; the browser sends it only to auth endpoints. |
| D5 | **Revocation via a `tokenVersion Int @default(0)` column on `User`.** Refresh tokens carry the version; logout increments it. | *Changed from the previous roadmap, which had no revocation.* Without it, "logout" does not really log out: a stolen refresh token keeps working for 7 days. One column keeps the subject's "small database" (no third table). Trade-off: logout ends **all** of that user's sessions, which is acceptable for a personal tool. Affects 06, 08, 17. |
| D6 | Registration returns `409 EMAIL_TAKEN` for an existing email. | Clear UX. It reveals whether an account exists; that is mitigated by rate limiting (07) and accepted for this app. Login never reveals it (05). |
| D7 | A non-owner receives **404**, never 403, for another user's application. | Does not confirm the id exists. |
| D8 | Search uses Prisma `contains` + `mode: 'insensitive'` (SQL `ILIKE`) on `company` and `position`; no full-text engine. | Enough at the A2 scale; a trigram index is a documented future improvement. |
| D9 | Offset pagination (`page`, `limit ≤ 50`) with a stable order (`appliedAt desc, id desc`); `count` and `findMany` run in one `$transaction`; composite index `(userId, appliedAt)`. | Matches the spec's response shape; the stable order prevents duplicated or skipped rows between pages. |
| D10 | Redux Toolkit holds **only the auth session** (`user`, `accessToken`, `status`). TanStack Query owns all server data. Filters and page live in the **URL** (`useSearchParams`). | Avoids duplicating a server cache in Redux; URLs become shareable and bookmarkable. |
| D11 | Forms are hand-written **controlled inputs** validated with Zod — no form library. | The subject lists controlled inputs as a skill to practise; five fields do not justify a dependency. |
| D12 | Native `fetch` wrapper, no axios. | One small file holds the token and refresh logic; one less dependency. |
| D13 | Vite dev proxy `/api → http://localhost:4000`; in production Express serves the built client from the same origin. | Same-origin in dev and prod: `SameSite=Lax` cookies work, no production CORS, dev/prod parity. The existing `cors` setup stays harmless until it is revisited in 24. |
| D14 | Backend tests: Vitest + Supertest against a **real** PostgreSQL test database (`job_application_db_test`). Frontend tests: Vitest + React Testing Library + MSW. | Ownership and constraint behaviour is best proven against the real database; MSW mocks the network boundary, not our code. |
| D16 | **As built in Phase 04 (your design):** `validate(schema)` passes the schema only the request sections it declares and stores the parsed result on `req.validated`. Handlers read it with `validated(schema, req)`. `req.body`, `req.query` and `req.params` stay raw. | Avoids the Express 5 getter problem without overriding a property. Rules for every later phase: (1) handlers never read `req.body`/`req.query`/`req.params` directly on validated routes; (2) exactly **one** `validate()` per route — a second call would overwrite `req.validated`, so combine `params` + `body` in one schema (Phase 10); (3) pass `validated()` the same schema used in `validate()`, because the type is a cast. |
| D17 | Tables are mapped to snake_case plural names (`users`, `job_applications`) via `@@map`; model names in code stay `User`/`JobApplication`. Migration `20260915111559_name_tables` recreated the tables (dev data was dropped). | Your choice, commit `36e4165`. Only matters for raw SQL and `psql`. Lesson for production: edit a generated drop/create migration into `ALTER TABLE … RENAME TO …` to keep data. |
| D15 | Rate limiting with `express-rate-limit` on auth routes; an `Origin` check on cookie-authenticated endpoints. `helmet` arrives with production HTML serving in 24. | Brute force is a real threat as soon as login exists; helmet's headers mostly matter once we serve HTML. |

---

## 4. Technology stack

| Layer | Technology | Version | Status |
| --- | --- | --- | --- |
| Runtime | Node.js | 22.20.0 | installed |
| Server language | TypeScript (native compiler) | 7.0.2 | installed |
| Dev runner | tsx | ^4.23 | installed |
| HTTP framework | Express | 5.2.1 | installed |
| ORM / driver | Prisma + @prisma/adapter-pg + pg | 7.10.0 / ^7.10 / ^8.23 | installed |
| Database | PostgreSQL | local instance on 5432 | running |
| Validation | Zod | 4.6.5 | installed |
| Hashing | bcrypt | ^6.0 | installed |
| Tokens | jsonwebtoken | ^9.0.3 | installed |
| Cookies / CORS / env | cookie-parser / cors / dotenv | ^1.4.7 / ^2.8.6 / ^17.4 | installed |
| Rate limiting | express-rate-limit | 8.7.x | Phase 07 |
| Backend tests | Vitest + Supertest | 5.0.x + 7.2.x | Phase 08 |
| Frontend | React + React DOM | ^19.2 | installed |
| Build tool | Vite (+ @vitejs/plugin-react) | ^8.3 | installed |
| Client language | TypeScript | ~6.0 | installed |
| Styling | Tailwind CSS (+ @tailwindcss/vite) | ^4.3 | installed |
| Routing | react-router | 8.3.x | Phase 14 |
| Client state | @reduxjs/toolkit + react-redux | 2.12.x + 9.3.x | Phase 16 |
| Server state | @tanstack/react-query | 5.102.x | Phase 19 |
| Frontend tests | Vitest + @testing-library/react + user-event + jest-dom + jsdom + msw | 5.0.x, 16.3.x, 14.6.x, 7.0.x, 30.0.x, 2.15.x | Phase 18 |
| CI | GitHub Actions | — | Phase 23 |

Future versions are the registry's current releases as of 2026-09-14. Each is re-checked,
and its API verified against the installed package, when its phase is expanded.

---

## 5. Final architecture (preview)

```text
Browser ── React 19 + TS (Vite) ───────────────────────────────────────────────
  react-router pages · controlled forms + Zod · Tailwind
  Redux Toolkit: auth session only (user, accessToken in memory)
  TanStack Query: stats, application list/detail cache, mutations, optimistic status
  URL search params: search · status · page
  api client (fetch): Bearer access token · on 401 → single POST /api/auth/refresh → retry
        │  same origin: Vite proxy (dev) / Express static (prod)
        ▼
Express 5 + TS  /api ───────────────────────────────────────────────────────────
  rateLimit(auth) → validate(Zod) → authenticate(JWT) → controller → service
  /auth    register · login · refresh (httpOnly cookie, rotation) · logout · me
  /applications   CRUD · ?search&status&page&limit · /stats   (every query WHERE userId)
  errorHandler: AppError / ZodError / bad JSON → safe JSON; unknown → 500
        │  Prisma Client 7 (driver adapter pg)
        ▼
PostgreSQL ─────────────────────────────────────────────────────────────────────
  User(id, email UNIQUE, passwordHash, name, tokenVersion)
    1 ──── * JobApplication(…, status ENUM, userId FK CASCADE,
                            INDEX(userId), INDEX(userId, appliedAt))
```

---

## 6. Risks and trade-offs

| Risk / trade-off | Consequence | Mitigation |
| --- | --- | --- |
| Very new major versions (Express 5, Zod 4, Prisma 7, TS 7, Vitest 5, React Router 8). | Most online examples are outdated — P1 and P3 came from exactly this. | Every code block is checked against the installed packages before it reaches you. |
| Stateless access tokens. | Still valid for up to 15 min after logout. | Short expiry; refresh tokens are revocable (D5). |
| `tokenVersion` revocation. | Logout ends every session of that user; reuse of a stolen, rotated token is not detected. | Documented limitation; a refresh-token table is the future upgrade. |
| Offset pagination. | Rows can shift between pages if data changes mid-browse. | Stable ordering; negligible at personal scale. |
| `ILIKE` search without a trigram index. | Slower on very large tables. | A2 scale; `pg_trgm` index as a future improvement. |
| Single-service deployment (API + client). | Frontend and backend are released together. | Simpler cookies, no CORS; acceptable for one developer. |
| Real test database. | You must create `job_application_db_test`; tests are slower than mocks. | They test what actually breaks (constraints, ownership). |
| Client-side refresh concurrency. | Parallel 401s could trigger several refreshes, and rotation makes the losers fail. | A single-flight refresh promise (Phase 17). |

---

## 7. Phase table

Each phase targets roughly 30–90 minutes and ends in something you can run and observe.

| # | Phase | Goal | New concepts (1–2) | Runnable result | Problem it solves | Status |
| - | --- | --- | --- | --- | --- | --- |
| 01 | Project setup | Scaffold server and client | TS/ESM toolchain, Vite + Tailwind | `npm run dev` in both packages | Nothing existed | ✅ done (commit `b12935b`, no doc) |
| 02 | Database & Prisma | Model User 1—* JobApplication | Prisma schema, migrations | `prisma migrate status` up to date | No persistence | ✅ done (in `b12935b`, no doc) |
| 03 | Express architecture | Layer the backend | routes→controllers→services, central errors | `GET /api/health` hits the DB | Unstructured handlers | ✅ done (commit `242db06`, no doc) |
| 04 | User registration | Create accounts safely | Password hashing in the sign-up flow; request validation at the boundary (incl. the Express 5 fix) | `POST /api/auth/register` → 201; 400/409 errors; bcrypt hash visible in Prisma Studio | No way to create users; `validate()` crashes (P1–P3) | ✅ done (commits `36e4165`, `e871505`) — [PHASE-04-user-registration.md](PHASE-04-user-registration.md) |
| 05 | Login & access tokens | Prove identity per request | JWT access tokens; authentication middleware (coupled: a token nobody checks is useless) | `POST /api/auth/login` → accessToken; `GET /api/auth/me` 200 with Bearer, 401 without | The server cannot tell who is calling (P4) | pending |
| 06 | Refresh tokens & logout | Long sessions that can be ended | httpOnly cookies; rotation + `tokenVersion` revocation (migration) | `POST /api/auth/refresh` rotates the cookie; after `logout`, the old cookie → 401 | 15-min sessions; logout that does not revoke | pending |
| 07 | Auth abuse protection | Resist brute force and CSRF | Rate limiting; `Origin` checks for cookie endpoints | 6th rapid failed login → 429; foreign Origin on refresh → 403; health no longer leaks counts | Password guessing, cross-site requests (P5) | pending |
| 08 | Backend test harness | Replace manual curl with tests | Vitest + Supertest; isolated test database | `npm test` runs the auth suite green against `job_application_db_test` | Security-critical behaviour has no regression protection (P6) | pending |
| 09 | Create & list own applications | Core domain, write and read | Ownership scoping (`userId` from the token, never the body); shared schema for application input | `POST` + `GET /api/applications` return only your own rows; tests prove isolation | No domain features yet | pending |
| 10 | Read, update, delete by id | Complete CRUD safely | Authorization on single resources (404 for others); partial updates with PATCH | `GET/PATCH/DELETE /api/applications/:id`; cross-user tests pass | Insecure direct object references (IDOR) | pending |
| 11 | Search & status filter | Let the database filter | Query-string validation/coercion; DB-side filtering | `?search=engineer&status=INTERVIEW` filtered by PostgreSQL | Fetching everything and filtering in React | pending |
| 12 | Pagination | Bounded responses | Offset pagination with stable ordering; transaction + composite-index migration | `{ data, page, limit, total, totalPages }` | Unbounded lists | pending |
| 13 | Dashboard statistics | Summaries for cards | Aggregation with `groupBy`; route ordering | `GET /api/applications/stats` → totals per status | The dashboard needs counts without loading every row | pending |
| 14 | Frontend routing shell | Navigable SPA skeleton | React Router layout routes; Vite dev proxy | `/login`, `/register`, `/`, `/applications/new`, `/applications/:id` render | Single placeholder page; cross-origin dev (P7) | pending |
| 15 | Register & login forms | Talk to the real API | Controlled inputs + Zod client validation; typed fetch client | Register/login from the browser, field and server errors shown | Users cannot sign up from the UI | pending |
| 16 | Session state with Redux | Share the session app-wide | Redux Toolkit store and slice; typed hooks | Navbar shows the user; logout clears the session | Many components need the same session data | pending |
| 17 | Protected routes & silent refresh | Stay logged in safely | Route guards; single-flight refresh on 401 + restore on load | Reload keeps you in; logged-out users are redirected | Sessions die on reload; unguarded pages | pending |
| 18 | Frontend test harness | Protect the UI's riskiest logic | Vitest + React Testing Library; MSW network mocks | `npm test` in `client/` covers forms and the guard | UI auth logic is untested | pending |
| 19 | Dashboard & list with TanStack Query | Render live server data | `useQuery` + query keys; loading/error states in custom hooks | Stat cards and application list from the API | Hand-rolled fetch/effect state is fragile | pending |
| 20 | Create application | First mutation | `useMutation` + cache invalidation; reusable form component | New application appears without reload | Cannot add data from the UI | pending |
| 21 | Details, edit, delete, quick status | Full CRUD UI | Optimistic updates with rollback; route params | Status changes instantly and rolls back on failure | Slow, clunky edits | pending |
| 22 | Filters, search & pagination UI | Usable list at scale | URL search params as state; debounce custom hook | URL `?search=&status=&page=` drives the list | Unusable list with many rows | pending |
| 23 | Continuous integration | Tests run on every push | GitHub Actions with a Postgres service | Green check on push/PR | Regressions merged unnoticed | pending |
| 24 | Production build & deployment | Live, hardened app | Single-origin serving + prod config (helmet, trust proxy, Secure cookies); `migrate deploy` + health check | Public URL working end-to-end | Only runs on your laptop | pending |
| — | FINAL-ARCHITECTURE.md | Document what was built | — | — | — | pending (after 24) |

### Mapping to the subject's 20-day plan

Days 1–4 → 01–03 · 5–6 → 04–07 · 7–10 → 08–10 · 11–13 → 11–13 · 14–15 → 14–16 ·
16–17 → 17–20 · 18 → 21–22 · 19 → 18 + 23 (testing is spread throughout instead of left
until the end) · 20 → 24.

### Dependencies

```text
01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10 → 11 → 12 → 13
                                                            │
                         14 → 15 → 16 → 17 → 18 → 19 → 20 → 21 → 22 → 23 → 24
```

Phases 15+ need the API from 04–07 running. 19+ need 09–13.

---

## 8. Working agreement

- I inspect, plan, explain, verify and review. **You type and run all application code.**
- Commit after each phase in small logical commits (each phase doc lists them).
- Show me your diff, or error output, whenever something does not match the "expected output" sections — reviewing it is part of my job.
