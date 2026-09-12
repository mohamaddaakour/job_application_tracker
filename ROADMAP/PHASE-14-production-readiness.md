# Phase 14 — Production Readiness

## Goal

Harden the application that phases 1–13 built, and document how to actually ship it, without
introducing any of the complexity the subject explicitly excludes (no Docker, no Kubernetes, no
CI/CD pipeline, no microservices). By the end of this phase the app has basic production-grade
HTTP security, sane logging, a top-level README, and a concrete (documentation-only) deployment
plan for a real managed host.

## Prerequisites

- Phases 1–7 (backend: setup, Prisma, layered architecture, auth, CRUD, filtering/pagination/
  stats, backend tests) complete and passing.
- Phases 8–13 (frontend: foundation, auth, dashboard/list, form/details, filters/pagination UI,
  frontend tests) complete and passing.
- Both `server` and `client` run locally together (`npm run dev` from the repo root).

## What's intentionally deferred (forever, per the subject)

Admin dashboard, email notifications, WebSockets/chat, AI features, resume parsing, job
scraping, OAuth, file uploads, dark mode, complex analytics/charts, microservices, Docker/
Kubernetes, multiple user roles, CI/CD pipelines, server-side refresh-token revocation (see
`FINAL-ARCHITECTURE.md` → Limitations).

## Concepts learned

- HTTP security headers (`helmet`).
- Rate limiting sensitive endpoints (`express-rate-limit`) to slow down credential-stuffing/
  brute-force attempts against auth routes.
- Structured request logging (`morgan`) vs. ad-hoc `console.log`.
- Environment-based configuration for production vs. development (secure cookies, CORS origin).
- The difference between "runs on my machine" and "deployable": build steps, start scripts,
  migrations-on-deploy, environment variables on a host.
- Why this project does not need Docker/Kubernetes at this scale, and what would change if it
  did (named explicitly, not implemented).

## Complete project structure at the end of this phase

```
job_application_tracker/
├── package.json
├── .gitignore
├── README.md
├── ROADMAP/
│   ├── 00-OVERVIEW.md
│   ├── PHASE-01-project-setup.md
│   ├── ... (all prior phase files)
│   ├── PHASE-14-production-readiness.md
│   └── FINAL-ARCHITECTURE.md
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── seed.ts
│   │   └── migrations/
│   └── src/
│       ├── app.ts                       (modified — helmet, morgan, rate limiter wired in)
│       ├── server.ts
│       ├── config/
│       │   ├── env.ts
│       │   └── prisma.ts
│       ├── routes/
│       ├── controllers/
│       ├── services/
│       ├── middlewares/
│       │   ├── auth.middleware.ts
│       │   ├── validate.middleware.ts
│       │   ├── error.middleware.ts
│       │   └── rateLimit.middleware.ts  (new)
│       ├── schemas/
│       ├── utils/
│       └── types/
└── client/
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── tailwind.config.js
    ├── .env.example
    ├── .env.production            (new — points VITE_API_URL at the deployed backend)
    └── src/  (unchanged from phase 13)
```

No new business features are added in this phase — only hardening, configuration, and docs.

## Implementation steps

### 1. Install production-hardening packages (server)

```bash
cd server
npm install helmet morgan express-rate-limit
npm install -D @types/morgan
```

### 2. Add a rate limiter middleware

`server/src/middlewares/rateLimit.middleware.ts`
```ts
import rateLimit from 'express-rate-limit';

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 20, // 20 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: { message: 'Too many attempts. Please try again later.' },
  },
});
```

This is applied only to `/api/auth/*` routes — the rest of the API relies on `authenticate` and
normal usage patterns, so a blanket limiter isn't needed at this scale.

### 3. Wire helmet, morgan, and the rate limiter into `app.ts`

`server/src/app.ts` (complete file — replaces the version from Phase 6/7)
```ts
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { authRateLimiter } from './middlewares/rateLimit.middleware';
import { errorHandler } from './middlewares/error.middleware';
import { healthRouter } from './routes/health.routes';
import { authRouter } from './routes/auth.routes';
import { applicationsRouter } from './routes/applications.routes';

export const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json());
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.use('/api/health', healthRouter);
app.use('/api/auth', authRateLimiter, authRouter);
app.use('/api/applications', applicationsRouter);

app.use(errorHandler);
```

> If your Phase 4–6 `app.ts` mounted routers under slightly different variable names, keep your
> existing router names — only the three additions matter here: `helmet()`, `morgan(...)`, and
> `authRateLimiter` applied to the auth router.

### 4. Make cookies production-safe

Wherever the refresh token cookie is set (in the auth service/controller from Phase 4), confirm
it uses the environment to decide `secure`:

```ts
res.cookie('refreshToken', refreshToken, {
  httpOnly: true,
  sameSite: 'lax',
  secure: env.NODE_ENV === 'production',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days, matches REFRESH_TOKEN_EXPIRES_IN
});
```

`secure: true` requires HTTPS, which is why it's conditional — local development over `http://
localhost` would otherwise silently drop the cookie.

### 5. Root `package.json` production scripts

`package.json` (repo root, complete file)
```json
{
  "name": "job-application-tracker",
  "private": true,
  "workspaces": ["server", "client"],
  "scripts": {
    "dev": "npm run dev --workspace server & npm run dev --workspace client",
    "build": "npm run build --workspace server && npm run build --workspace client",
    "start": "npm run start --workspace server",
    "test": "npm run test --workspace server && npm run test --workspace client",
    "migrate:deploy": "npm run migrate:deploy --workspace server"
  }
}
```

`server/package.json` must expose (confirm from earlier phases, add if missing):
```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "migrate:deploy": "prisma migrate deploy",
    "test": "vitest run"
  }
}
```

`client/package.json` must expose:
```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  }
}
```

### 6. Add `client/.env.production`

```
VITE_API_URL=https://<your-backend-host>/api
```

Vite automatically uses `.env.production` values when you run `npm run build`.

### 7. Write the top-level README

`README.md`
```markdown
# Job Application Tracker

A small full-stack app for tracking job applications: register/login, add applications,
search/filter/paginate them, update their status, and see a small stats dashboard.

## Stack

React + TypeScript + Vite + Redux Toolkit + TanStack Query + Tailwind CSS on the frontend;
Express + TypeScript + Prisma + PostgreSQL with JWT access/refresh auth on the backend.

## Local development

Prerequisites: Node.js 20+, a local PostgreSQL instance.

1. `npm install` (installs both workspaces)
2. Copy `server/.env.example` to `server/.env` and fill in `DATABASE_URL` (and
   `DATABASE_URL_TEST` if you'll run backend tests).
3. Copy `client/.env.example` to `client/.env`.
4. `npm run migrate:deploy` (or `npx prisma migrate dev` from `server/` on first setup)
5. `npm run dev` — backend on http://localhost:4000, frontend on http://localhost:5173.

## Testing

`npm test` runs the backend (Vitest + Supertest against `DATABASE_URL_TEST`) and frontend
(Vitest + React Testing Library + MSW) suites.

## Deployment

See `ROADMAP/PHASE-14-production-readiness.md` for the full deployment guidance and
`ROADMAP/FINAL-ARCHITECTURE.md` for the complete architecture writeup.
```

### 8. Deployment guidance (documentation only — no code to write)

This project deliberately stays out of Docker/Kubernetes territory. A managed PaaS is enough:

**Database**: provision a managed PostgreSQL instance (e.g. Render PostgreSQL, Railway
PostgreSQL, Neon, or Supabase's Postgres). Copy the connection string into `DATABASE_URL`.

**Backend** (e.g. Render Web Service or Railway):
- Build command: `npm install && npm run build --workspace server`
- Start command: `npm run start --workspace server`
- Run `npx prisma migrate deploy` (or the root `npm run migrate:deploy`) as a release/predeploy
  step so the production database schema stays in sync with `prisma/migrations/`.
- Set environment variables: `NODE_ENV=production`, `PORT` (host-provided or 4000), `CLIENT_URL`
  (the deployed frontend's URL, for CORS), `DATABASE_URL`, `JWT_ACCESS_SECRET`,
  `JWT_REFRESH_SECRET`, `ACCESS_TOKEN_EXPIRES_IN`, `REFRESH_TOKEN_EXPIRES_IN`. Generate real
  random secrets for the two JWT values — never reuse the `.env.example` placeholders.

**Frontend** (e.g. Vercel or Netlify):
- Build command: `npm run build --workspace client` (or just `vite build` if deployed as its
  own project root pointed at `client/`).
- Output directory: `client/dist`.
- Environment variable: `VITE_API_URL` set to the deployed backend's `/api` URL.
- Because the frontend and backend are on different domains in this setup, `CLIENT_URL` on the
  backend and `sameSite`/`secure` cookie settings must match: `secure: true` cookies require
  HTTPS on both ends, which every one of the hosts above provides by default.

**Why not Docker/Kubernetes**: at this scale (two processes, one database, no horizontal
scaling requirement, no multi-service orchestration), a container orchestrator adds operational
surface area — image builds, a registry, a cluster or compose file to maintain — without solving
a problem this app actually has. It would become worth it if you needed to run multiple
coordinated services, guarantee identical runtime environments across a team, or scale backend
instances independently under load — none of which apply here. This is a deliberate scope
decision, not an oversight.

## How It Works

A request to the deployed frontend loads static assets built by `vite build` from a CDN/edge
host. The page's JS calls the deployed backend's `/api/*` URL (baked in at build time via
`VITE_API_URL`). The backend, running as a long-lived Node process on the PaaS, receives the
request through `helmet` (security headers), `cors` (origin-restricted to `CLIENT_URL`),
`cookieParser`, `express.json()`, and `morgan` (access logging) before it ever reaches a route —
exactly the same middleware chain phases 3–6 built, just now running against a production
database with production secrets and `secure` cookies. Auth rate limiting protects
`/api/auth/*` specifically, since credential-guessing traffic concentrates there.

## End-to-end example

Locally, with `NODE_ENV=production` temporarily set and `npm run build && npm start` in
`server/`, then `npm run build && npm run preview` in `client/`:

```bash
curl -i http://localhost:4000/api/health
```
Expected: a `200` with security headers now present, e.g. `X-Content-Type-Options: nosniff`,
`X-DNS-Prefetch-Control: off`, confirming `helmet()` is active — compare to a `curl -i` from
Phase 3, which lacked these headers.

## Test This Phase

1. `cd server && npm run build && npm start` — confirm the compiled server boots from
   `dist/server.js` and responds on port 4000, using `.env` values (unset `NODE_ENV` back to
   `development` afterward for local dev).
2. `curl -i http://localhost:4000/api/health` and confirm `helmet` response headers appear.
3. Hit `POST /api/auth/login` with wrong credentials 25 times in under 15 minutes from the same
   client — the 21st+ request should return `429 Too Many Requests` with the JSON message from
   `authRateLimiter`.
4. `cd client && npm run build && npm run preview`, open the preview URL, and confirm the app
   still logs in and lists applications against the local backend (update `client/.env` or
   `.env.production` `VITE_API_URL` accordingly for this manual check).
5. Read through `README.md` as if you were a new developer with nothing but this repo — every
   command in it should be copy-pasteable and correct.

Failure indicators: missing security headers means `helmet()` isn't mounted before the routes;
a rate limiter that never triggers means it's mounted on the wrong router or `windowMs`/`limit`
are misconfigured; a production build that can't reach the API means `VITE_API_URL` wasn't
picked up (Vite only reads `.env.production` during `vite build`, not `vite dev`).

## Common Failure Points

- Forgetting `secure: env.NODE_ENV === 'production'` on the refresh cookie causes silent cookie
  loss in production over HTTPS-only hosts if left hardcoded to `false`, or breaks local HTTP
  dev if hardcoded to `true`.
- CORS `origin` mismatched against the actual deployed frontend URL (including protocol and any
  trailing slash) silently blocks every request with an opaque browser CORS error, not a helpful
  server error.
- Running `prisma migrate dev` against a production database instead of `prisma migrate deploy`
  — `migrate dev` can prompt interactively and is meant for local development only.

## Common Mistakes

- Committing real `.env` files instead of only `.env.example`/`.env.production` templates.
- Applying the rate limiter globally instead of scoping it to `/api/auth`, which throttles
  legitimate authenticated users making normal CRUD requests.
- Assuming `helmet()` alone is "enough security" — it sets sensible headers, it does not replace
  input validation (Phase 4/5's Zod schemas), authorization (Phase 5's ownership checks), or
  secrets management.

## Checkpoint

At this point the application:
- Has real authentication, authorization, validation, CRUD, filtering, pagination, and stats.
- Is covered by backend and frontend automated tests.
- Has basic HTTP hardening (helmet, CORS restricted to a known origin, rate-limited auth
  endpoints) and environment-aware cookie security.
- Has a README a new developer (or an interviewer) could follow from clone to running app.
- Has a concrete, honest deployment story that matches its actual scale — no infrastructure it
  doesn't need.

You should be able to explain every subject's target question listed in `subject.md`'s closing
section, and additionally: why `helmet`/CORS/rate-limiting belong at the edge of the request
pipeline, and why this project's scale does not justify Docker/Kubernetes.

## Preparation for the Next Phase

There is no next phase — this is the final implementation phase. `FINAL-ARCHITECTURE.md`
consolidates everything built across phases 1–14 into one architecture reference, including the
project's named limitations and possible future improvements (e.g. adding refresh-token
revocation, if this project ever needed that level of security).
