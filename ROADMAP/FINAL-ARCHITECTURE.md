# Final Architecture — Job Application Tracker

This document consolidates the system built across Phases 1–14 into a single architecture
reference. It assumes every phase file has been implemented in order.

## 1. Complete project structure

```
job_application_tracker/
├── package.json                # npm workspaces: ["server", "client"]
├── README.md
├── ROADMAP/                    # this roadmap
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── seed.ts
│   │   └── migrations/
│   └── src/
│       ├── app.ts              # express app: helmet, cors, cookieParser, morgan, routers, errorHandler
│       ├── server.ts           # boots app.ts on PORT
│       ├── config/
│       │   ├── env.ts          # validated process.env access
│       │   └── prisma.ts       # PrismaClient singleton
│       ├── routes/              (health, auth, applications)
│       ├── controllers/         (auth, applications — thin, parse+respond)
│       ├── services/            (auth, applications — business logic + Prisma)
│       ├── middlewares/         (authenticate, validate, error, rateLimit)
│       ├── schemas/             (Zod: auth, application)
│       ├── utils/               (AppError, asyncHandler)
│       └── types/                (Express Request augmentation: req.user)
└── client/
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.js
    ├── .env.example / .env.production
    └── src/
        ├── main.tsx / App.tsx
        ├── api/axiosClient.ts
        ├── app/store.ts
        ├── components/ (Navbar, ProtectedRoute, common UI)
        ├── features/
        │   ├── auth/ (authSlice, LoginForm, RegisterForm)
        │   ├── applications/ (hooks, ApplicationList/Card/Form/Filters, ApplicationDetails)
        │   └── dashboard/ (StatsCards)
        ├── hooks/ (useDebouncedValue, etc.)
        ├── pages/ (Login, Register, Dashboard, Applications, ApplicationForm, ApplicationDetails)
        ├── routes/ (AppRouter)
        ├── types/
        └── lib/
```

## 2. Component / module relationships

```
Browser
  └─ React app (client/src)
      ├─ Redux store: auth slice only { user, accessToken, status }
      ├─ TanStack QueryClient: applications list / single / stats caches
      ├─ React Router: page routes + useSearchParams (filters/search/page)
      └─ axiosClient: baseURL=VITE_API_URL, withCredentials=true, 401→refresh→retry interceptor
            │ HTTP (JSON, cookies)
            ▼
Express app (server/src/app.ts)
  helmet → cors(CLIENT_URL) → cookieParser → express.json → morgan
      │
      ▼
  routers: /api/health, /api/auth (rate-limited), /api/applications
      │
      ▼
  middlewares: authenticate (JWT verify) → validate(zodSchema)
      │
      ▼
  controllers (thin) → services (business logic, ownership checks) → Prisma Client
      │
      ▼
  PostgreSQL: User (1) ── (*) JobApplication
```

## 3. Complete execution flows

### Registration → authenticated session
1. `RegisterForm` (react-hook-form + Zod) → `POST /api/auth/register`.
2. `validate(registerSchema)` middleware rejects malformed input with `400`.
3. `auth.service.ts` hashes the password with bcrypt, creates the `User`, signs an access JWT
   (15m) and refresh JWT (7d).
4. Controller sets `refreshToken` as an httpOnly cookie and returns `{ user, accessToken }`.
5. Frontend `authSlice` thunk stores `accessToken` and `user` in Redux memory (never
   `localStorage`). `ProtectedRoute` now allows navigation to `/`.

### Session restore on page reload
1. On `main.tsx`/`App.tsx` mount, a bootstrap thunk fires `POST /api/auth/refresh` (browser
   automatically attaches the httpOnly cookie).
2. If the cookie is valid, the server issues a new access token; Redux is populated and the app
   renders protected routes. If invalid/absent, the user lands on `/login`.

### Reading applications with filters
1. `ApplicationsPage` reads `search`/`status`/`page` from `useSearchParams` (the single source
   of truth for this state — not Redux, not component state).
2. `useApplications({ search, status, page, limit })` builds the TanStack Query key
   `['applications', { search, status, page, limit }]` and calls
   `GET /api/applications?search=&status=&page=&limit=`.
3. `authenticate` middleware verifies the access token; if expired, the axios interceptor already
   refreshed it before this request was sent (or retries once on a `401`).
4. `applications.service.ts` builds a Prisma `where` (`userId` always included — this is the
   authorization boundary) with case-insensitive `contains` on company/position and an exact
   match on `status`, plus `skip`/`take` for pagination, and returns
   `{ data, page, limit, total, totalPages }`.
5. `ApplicationList`/`ApplicationCard` render `data`; pagination controls read `page`/`totalPages`.

### Mutating an application (status update, optimistic)
1. User changes status from `ApplicationDetailsPage`.
2. `useUpdateApplication` mutation optimistically writes the new status into the
   `['applications', id]` cache entry, then calls `PATCH /api/applications/:id`.
3. Server re-validates ownership (`WHERE id = :id AND userId = req.user.id`); a non-owner or
   nonexistent id both yield `404` (never `403`, so existence isn't leaked).
4. On success, the mutation invalidates `['applications']` (list) and `['stats']` so both stay
   consistent with the server. On failure, the optimistic write is rolled back to the previous
   cache value.

## 4. Database / data flow

```
User
 id (uuid, PK)
 email (unique)
 passwordHash
 name
 createdAt / updatedAt
   │ 1
   │
   │ *
   ▼
JobApplication
 id (uuid, PK)
 company, position, location?, jobUrl?, notes?
 status: APPLIED | INTERVIEW | REJECTED | OFFER | ACCEPTED
 appliedAt
 userId (FK → User.id, ON DELETE CASCADE)
 createdAt / updatedAt
 @@index([userId])
```

All application queries are scoped by `userId` at the service layer — this is the single
authorization mechanism in the system, applied consistently to list, get, update, and delete.
The `userId` index keeps per-user list/filter/pagination queries efficient without needing any
caching layer at this scale.

## 5. Major design decisions

- **Redux limited to auth state; TanStack Query owns all server data.** Avoids the common
  anti-pattern of mirroring server data into a global store and manually keeping it in sync.
  Directly answers the subject's target question ("Why TanStack Query instead of Redux for this
  data?").
- **Filters live in the URL (`useSearchParams`), not in state.** Makes a filtered/paginated view
  shareable and bookmarkable, and gives the TanStack Query key one unambiguous source of truth.
- **Access token in memory, refresh token in an httpOnly cookie.** Standard mitigation against
  XSS-based token theft: JavaScript can never read the refresh token, and a stolen access token
  is only useful for 15 minutes.
- **Authorization enforced in the service layer via `userId` filtering, not just at the
  controller.** Every Prisma query for `JobApplication` includes `userId` in its `where` clause,
  so there is no code path that can accidentally return another user's data.
- **404, not 403, on ownership violations.** Prevents an attacker from distinguishing "exists but
  isn't yours" from "doesn't exist," which would otherwise leak information about other users'
  data via id enumeration.
- **Controllers stay thin; services hold business logic.** Keeps HTTP concerns (status codes,
  request/response shaping) separate from domain logic (ownership rules, aggregation for stats),
  which is what makes the backend testable with Supertest at the HTTP boundary and independently
  reasoned about at the service layer.

## 6. Security model

- Passwords: bcrypt-hashed (10 rounds), never stored or logged in plaintext.
- Transport-level: `helmet()` sets standard security headers; CORS restricted to the exact
  `CLIENT_URL` origin with `credentials: true`.
- AuthN: short-lived JWT access tokens verified by `authenticate` middleware on every protected
  route; longer-lived JWT refresh tokens carried only in an httpOnly, `sameSite=lax`,
  environment-conditional `secure` cookie.
- AuthZ: per-request `userId` scoping in the service layer, verified by the Phase 7 test suite's
  "user A cannot access user B's application" cases.
- Input validation: every mutating endpoint and the applications list endpoint validate
  `req.body`/`req.query` with Zod before touching the database.
- Abuse mitigation: `express-rate-limit` on `/api/auth/*` only, since that's where
  credential-guessing traffic concentrates.

## 7. Testing strategy

- **Backend**: Vitest + Supertest against a real `DATABASE_URL_TEST` PostgreSQL database,
  migrated before the suite runs and truncated between tests. Covers auth success/failure paths,
  full CRUD happy paths, Zod validation failures, and — critically — cross-user authorization
  (Phase 7).
- **Frontend**: Vitest + React Testing Library + MSW. MSW stubs the exact `/api/*` contracts
  from this document at the network boundary, so component and hook tests run without a live
  backend while still exercising real TanStack Query cache behavior (Phase 13).
- Both suites are wired to `npm test` at the repo root (Phase 14).

## 8. Performance and scalability considerations

- Pagination and filtering happen in PostgreSQL (via Prisma `where`/`skip`/`take`), not in the
  React client — the client only ever receives the page it's displaying, per the subject's
  explicit instruction not to fetch everything and filter client-side.
- The `userId` index on `JobApplication` keeps the dominant query pattern (list/filter/paginate
  a single user's applications) efficient without needing a cache layer at this project's scale.
- TanStack Query's cache avoids redundant refetches of the same filter/page combination within
  its stale-time window, reducing load without any custom caching code.
- No background jobs, queues, or horizontal scaling are needed at this scale; none were built.

## 9. Deployment / production considerations

Covered in full in `PHASE-14-production-readiness.md`: managed PostgreSQL, a PaaS host for the
Express app (build → `prisma migrate deploy` → start), and a static host for the Vite build,
with environment-specific cookie security (`secure` in production) and CORS locked to the
deployed frontend origin. No Docker/Kubernetes — deliberately out of scope at this size (named
in Phase 14 with the specific reasoning).

## 10. Key trade-offs

| Trade-off | What was chosen | What was given up |
| --- | --- | --- |
| Refresh token storage | Stateless JWT refresh cookie, no DB table | Cannot revoke a single refresh token early (e.g. on "log out of all devices" or a suspected leak) without waiting out its 7-day expiry |
| Redux scope | Auth only | None of the ergonomic downsides — this is a strict improvement over storing server data in Redux, not a trade-off with a real cost here |
| Forms library | react-hook-form + Zod | An extra dependency not literally named in the subject, in exchange for far less controlled-input boilerplate across 5+ form fields |
| Backend tests | Real test database over Prisma mocking | Slower test runs and a required local/CI Postgres instance, in exchange for tests that catch real query/schema bugs mocks would hide |
| Deployment | Managed PaaS, no containers | Less deployment portability/reproducibility than Docker would give, in exchange for zero infra code to write or maintain — the right trade at this scale per the subject's own instruction |

## 11. Limitations

- **No refresh-token revocation.** Logging out only clears the cookie client-side; a copied
  refresh token remains valid until it expires (max 7 days). Acceptable for a personal tracker,
  not acceptable as-is for a system protecting more sensitive data.
- **No rate limiting beyond `/api/auth/*`.** The applications endpoints are only protected by
  requiring authentication, not by request-volume limits.
- **No account recovery (password reset) flow.** Out of scope per the subject ("keep it simple");
  a user who forgets their password has no self-service recovery path.
- **No optimistic concurrency control.** Two simultaneous edits to the same application from two
  tabs will result in last-write-wins, with no conflict detection.

## 12. Recommended future improvements (not built, explicitly out of current scope)

- A `RefreshToken` table (hashed tokens, one row per issued session) to support revocation and
  "log out everywhere" — the natural next step if this ever needed to be more security-sensitive.
- Password reset via a signed, time-limited token (would need email delivery, which the subject
  explicitly excludes today).
- Optimistic concurrency (an `updatedAt`-based check on `PATCH`) if multi-tab/multi-device
  concurrent editing became a real usage pattern.
- Cursor-based pagination if application lists grew large enough for offset pagination's
  performance characteristics to matter (not a concern at personal-tracker scale).

## 13. Recommended sequence to rebuild this project from memory

1. Scaffold the npm-workspaces monorepo (`server`, `client`), get a "hello" Express route and a
   blank Vite React page running side by side.
2. Write the Prisma schema (`User` 1—* `JobApplication`, the 5-value status enum), migrate, seed.
3. Build the Express layers (`routes → middlewares → controllers → services → Prisma`) around a
   single `/api/health` route so the pattern exists before any real feature does.
4. Implement auth: bcrypt hashing, access+refresh JWTs, the refresh-cookie flow, `authenticate`
   middleware, Zod-validated register/login.
5. Implement applications CRUD with `userId`-scoped ownership checks (404 on violation) from the
   very first endpoint, not bolted on later.
6. Add search/status filtering, pagination, and the stats aggregation endpoint — mounting
   `/applications/stats` before `/applications/:id`.
7. Write the backend test suite, including the cross-user authorization case, before moving to
   the frontend.
8. Scaffold the React app shell: router, an auth-only Redux store, a TanStack QueryClient,
   Tailwind layout, stubbed protected routes.
9. Wire real authentication: the axios refresh interceptor, the auth slice's thunks, the
   session-bootstrap-on-load flow, and real route protection.
10. Build the read paths first (dashboard stats, application list) with TanStack Query before
    touching any mutation.
11. Add the write paths (create/edit/delete, one deliberate optimistic update) with correct cache
    invalidation.
12. Move filter/search/page state into the URL and wire it to the list query.
13. Write the frontend test suite with MSW stubbing the same contracts the backend implements.
14. Harden (helmet, CORS, auth rate limiting, environment-aware cookies), write the README, and
    document deployment — without introducing infrastructure the project's scale doesn't need.
