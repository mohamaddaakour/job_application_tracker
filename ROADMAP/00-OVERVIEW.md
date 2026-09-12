# Job Application Tracker — Project Roadmap Overview

## 1. Project objective

Build a small, production-style full-stack web application where an authenticated user can
track the job applications they submit: create them, list/search/filter/paginate them, update
their status, edit or delete them, and see a small dashboard of statistics. The goal stated in
`subject.md` is explicitly **depth over feature count**: a correctly-layered Express + Prisma +
PostgreSQL backend with real authentication/authorization/validation, and a React + TypeScript
frontend that uses TanStack Query for server state and Redux only where it actually belongs.

This is a **greenfield project** — at the start of this roadmap the repository contains only
`subject.md`. Every phase below builds the project from nothing.

## 2. Specified requirements (from `subject.md`)

- Auth: register, login, logout, protected routes, password hashing, access token, refresh
  token, authentication middleware.
- Job application CRUD with fields: id, company, position, location, jobUrl, status, appliedAt,
  notes, createdAt, updatedAt. Status ∈ {APPLIED, INTERVIEW, REJECTED, OFFER, ACCEPTED}.
- Endpoints: `POST/GET /applications`, `GET/PATCH/DELETE /applications/:id`.
- Search + status filtering done server-side: `GET /applications?search=&status=`.
- Pagination done server-side: `GET /applications?page=&limit=` with a `{ data, page, limit,
  total, totalPages }` response shape.
- Dashboard backed by `GET /applications/stats` (no charting libraries — a few stat cards).
- Authorization: a user must never be able to read/modify another user's applications, even by
  guessing an id.
- Stack: React + TypeScript, Redux, TanStack Query, Express + TypeScript, PostgreSQL, Prisma,
  JWT + refresh token, Zod, Vitest, Tailwind CSS.
- Explicitly excluded: admin dashboard, email notifications, WebSockets, chat, AI, resume
  parsing, job scraping, OAuth, file uploads, dark mode, complex analytics/charts,
  microservices, Docker/Kubernetes, multiple user roles.

## 3. Assumptions and implementation decisions (not specified, chosen and documented here)

These are reasonable defaults chosen so the project can be built without back-and-forth. They
are treated as fixed contracts across every phase file.

| Decision | Choice | Reasoning |
| --- | --- | --- |
| Repo layout | npm workspaces monorepo, `server/` + `client/` | Keeps one repo, one README, independent `package.json`s, no need for Docker/Nx-level tooling. |
| Frontend build tool | Vite | Standard, fast, minimal config; not mentioned in subject but required to run React+TS. |
| Backend port | 4000 | Arbitrary, fixed for consistency across phases. |
| Frontend port | 5173 | Vite's default. |
| API prefix | `/api` | Conventional separation from any future static hosting. |
| Access token storage | In memory only (Redux state), never `localStorage` | Reduces XSS token-theft blast radius; access tokens are short-lived (15m) so losing them on refresh is cheap. |
| Refresh token storage | `httpOnly`, `sameSite=lax` cookie named `refreshToken` | Cannot be read by JS, standard mitigation against XSS token theft. |
| Refresh token revocation | **Not implemented** — no server-side refresh-token table | The subject explicitly says "keep the database small... you don't need 10 tables." A revocation list is a real production feature but adds a table and complexity beyond what an intermediate-scope project needs. This is a named, deliberate limitation — see `FINAL-ARCHITECTURE.md` → Limitations. |
| Password hashing | bcrypt, 10 rounds | Industry-standard default. |
| Ownership-violation status code | `404`, not `403` | Prevents leaking whether a given id exists at all to a non-owner. |
| Redux scope | **Auth state only** (`user`, `accessToken`, `status`) | TanStack Query already owns server data (caching, refetching, invalidation) — duplicating that in Redux is the single most common React anti-pattern this project is designed to avoid. This is a deliberate teaching point (see subject's own target question: "Why TanStack Query instead of Redux for this data?"). |
| Filter/search/page state | React Router `useSearchParams`, not Redux, not local state | Makes filters shareable/bookmarkable and gives one source of truth that both drives the TanStack Query cache key and renders the UI. |
| Forms | `react-hook-form` + Zod (`@hookform/resolvers`) | Not named in the subject, but needed to fulfil "Form validation with Zod" on the frontend without hand-rolling controlled-input boilerplate for five fields. |
| Backend testing | Vitest + Supertest against a real test PostgreSQL database (`DATABASE_URL_TEST`) | Exercises the real Prisma layer instead of mocking it away, closer to what "intermediate" backend testing should look like. |
| Frontend testing | Vitest + React Testing Library + MSW | MSW stubs `/api/*` at the network boundary so component tests don't need a running backend. |
| Deployment | Documentation only: Render/Railway (backend + managed Postgres) + Vercel/Netlify (frontend) | Subject explicitly excludes Docker/Kubernetes complexity; deployment is covered as configuration and guidance, not new infrastructure code. |

## 4. Final technology stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18 + TypeScript + Vite |
| Frontend routing | React Router v6 |
| Client UI state | Redux Toolkit (auth only) |
| Server state | TanStack Query v5 |
| Forms/validation (client) | react-hook-form + Zod |
| Styling | Tailwind CSS |
| Backend | Express + TypeScript (Node.js) |
| ORM | Prisma |
| Database | PostgreSQL |
| Auth | JWT access token (15m) + JWT refresh token (7d, httpOnly cookie) |
| Validation (server) | Zod |
| Testing | Vitest (+ Supertest backend, + React Testing Library/MSW frontend) |

## 5. Phase roadmap

| # | Phase | Goal | Main concepts introduced | Executable result |
| - | --- | --- | --- | --- |
| 1 | Project Setup & Tooling | Scaffold the monorepo | npm workspaces, TS configs, Tailwind, Vite | `npm run dev` serves an Express "hello" API and a React "hello" page |
| 2 | Database & Prisma | Model the data | Prisma schema, migrations, seeding | `npx prisma studio` shows Users/JobApplications tables |
| 3 | Express Architecture | Layer the backend | routes→controllers→services→Prisma, central error handling | `GET /api/health` flows through every layer and returns JSON |
| 4 | Authentication | Real login system | bcrypt, JWT access+refresh, auth middleware, Zod | Register/login/refresh/logout/me work end-to-end via curl/Postman |
| 5 | Applications CRUD | Core domain logic | REST CRUD, ownership authorization | Full CRUD on `/api/applications`, cross-user access blocked |
| 6 | Filtering, Pagination & Stats | Query the data properly | Prisma `where`, `skip/take`, aggregation | `?search=&status=&page=&limit=` and `/stats` work |
| 7 | Backend Testing | Prove the API works | Vitest, Supertest, test DB lifecycle | `npm run test` (server) passes a full auth+CRUD+authz suite |
| 8 | Frontend Foundation | Scaffold the SPA shell | Router, Redux store, Query client, Tailwind layout | App runs, navigable pages, no real data yet |
| 9 | Frontend Authentication | Wire real auth | Redux auth slice, axios interceptor, protected routes | Can register/login/logout for real, session survives refresh |
| 10 | Dashboard & Application List | Show server data | TanStack Query hooks, loading/error states | Dashboard stats and applications list render live data |
| 11 | Application Form & Details | Mutate server data | Mutations, cache invalidation, optimistic UI | Create/edit/delete an application from the UI |
| 12 | Filters, Search & Pagination UI | Make the list usable | `useSearchParams`, debouncing, `useMemo` | Search/filter/paginate from the browser, URL reflects state |
| 13 | Frontend Testing | Prove the UI works | Vitest, RTL, MSW | `npm run test` (client) passes component/hook tests |
| 14 | Production Readiness | Harden & document | helmet, rate limiting, README, deployment guidance | App is deployable and documented end-to-end |

## 6. Phase dependency progression

```
1 → 2 → 3 → 4 → 5 → 6 → 7   (backend track, strictly sequential)
                 │
                 ▼
        8 → 9 → 10 → 11 → 12 → 13   (frontend track; 8 can start once API
                                      contracts from phases 4-6 are fixed,
                                      but 9-13 need the real running API)
                 │
                 ▼
                14   (needs both tracks complete)
```

Phases 1–7 (backend) must be built and run in order. Phases 8–13 (frontend) must also be built
in order, and phases 9 onward require the backend from phases 4–6 to actually be running.
Phase 14 assumes both tracks are finished.

## 7. Preview of the final architecture

```
React + TypeScript (Vite, :5173)
   │  Redux (auth only) · TanStack Query (server data) · React Router
   │  HTTP (axios, credentials: include)
   ▼
Express + TypeScript (:4000, prefix /api)
   routes → authenticate/validate middleware → controllers → services
   │
   │  Prisma Client
   ▼
PostgreSQL
   User (1) ──── (*) JobApplication
```

See `FINAL-ARCHITECTURE.md` (written after all phases) for the complete breakdown, security
model, testing strategy, and named limitations.

## 8. Existing repository state

There is no existing application code — only `subject.md`. Nothing is being preserved,
modified, or migrated; every phase creates new files. `subject.md` remains untouched as the
original specification document.
