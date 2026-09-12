# Phase 7 — Backend Testing

## Goal

Set up Vitest + Supertest against a real test PostgreSQL database (`DATABASE_URL_TEST`), with a
test setup file that runs migrations before the suite and truncates tables between tests, and
write a meaningful suite covering: auth (register/login/refresh/logout success and failure
cases), applications CRUD happy paths, validation failures (400), and — critically — a test
proving user A cannot read/update/delete user B's application (expect 404). By the end of this
phase, `npm run test` (in `server/`) passes the full suite against a clean test database every
run.

## Prerequisites

- Phase 6 complete: full CRUD + filtering + pagination + stats all working.
- A `job_tracker_test` PostgreSQL database exists (created back in Phase 2's prerequisites) and
  is reachable via `DATABASE_URL_TEST` in `server/.env`.

## What's intentionally deferred

- Nothing further is deferred within the backend track — Phase 7 is the last backend phase.
  Frontend testing (Vitest + RTL + MSW) is a separate concern covered by Phase 13, owned by the
  frontend track.

## Concepts learned

- Configuring Vitest for a Node/Express backend (as opposed to a browser/DOM environment).
- Supertest: making real HTTP requests against an in-memory Express `app` (imported directly,
  never bound to a port) without needing the dev server running.
- Test database lifecycle: running Prisma migrations against a dedicated test database before
  the suite starts, and truncating all tables before each individual test so every test starts
  from a known-empty state without re-running migrations each time.
- Structuring integration tests around real database calls (no mocking Prisma) to catch actual
  query bugs, consistent with the spec's testing philosophy.
- Writing an authorization-focused test that proves a specific security property (cross-user
  404s) rather than just happy-path coverage.

## Complete project directory structure (end of Phase 7)

```
job_application_tracker/
├── package.json
├── .gitignore
├── README.md
├── subject.md
├── ROADMAP/
│   └── ... (unchanged)
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── .env.example
│   ├── .env
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── seed.ts
│   │   └── migrations/
│   │       └── <timestamp>_init/
│   │           └── migration.sql
│   ├── src/
│   │   ├── app.ts
│   │   ├── server.ts
│   │   ├── config/
│   │   │   ├── env.ts
│   │   │   └── prisma.ts
│   │   ├── routes/
│   │   │   ├── index.ts
│   │   │   ├── health.routes.ts
│   │   │   ├── auth.routes.ts
│   │   │   └── application.routes.ts
│   │   ├── controllers/
│   │   │   ├── health.controller.ts
│   │   │   ├── auth.controller.ts
│   │   │   └── application.controller.ts
│   │   ├── services/
│   │   │   ├── health.service.ts
│   │   │   ├── auth.service.ts
│   │   │   └── application.service.ts
│   │   ├── middlewares/
│   │   │   ├── error.middleware.ts
│   │   │   ├── validate.middleware.ts
│   │   │   └── authenticate.middleware.ts
│   │   ├── schemas/
│   │   │   ├── auth.schema.ts
│   │   │   └── application.schema.ts
│   │   ├── utils/
│   │   │   ├── AppError.ts
│   │   │   ├── asyncHandler.ts
│   │   │   ├── hash.ts
│   │   │   └── jwt.ts
│   │   └── types/
│   │       └── express.d.ts
│   └── tests/
│       ├── setup.ts
│       ├── helpers/
│       │   └── testClient.ts
│       ├── auth.test.ts
│       └── applications.test.ts
└── client/
    └── ... (unchanged)
```

## Step-by-step implementation

### 1. Install test dependencies

```bash
cd server
npm install -D vitest supertest @types/supertest dotenv-cli
cd ..
```

`dotenv-cli` lets the test script load `.env` while overriding `DATABASE_URL` with the value of
`DATABASE_URL_TEST`, without needing a second `.env` file.

### 2. Create `server/vitest.config.ts`

### 3. Create `server/tests/setup.ts` — runs migrations against the test DB once, and truncates
   all tables before each individual test.

### 4. Create `server/tests/helpers/testClient.ts` — a helper to register a user via the real
   HTTP endpoint and return their credentials/tokens for use in tests.

### 5. Write `server/tests/auth.test.ts`.

### 6. Write `server/tests/applications.test.ts`.

### 7. Add `test`/`test:watch` scripts to `server/package.json` that point `DATABASE_URL` at
   `DATABASE_URL_TEST` via `dotenv-cli`.

## Exact package installs (summary)

```bash
cd server
npm install -D vitest supertest @types/supertest dotenv-cli
cd ..
```

## Full file contents

### `server/vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    hookTimeout: 30000,
    testTimeout: 15000,
    // Tests share one physical test database and truncate tables between tests, so test files
    // must not run in parallel worker pools (which would race on the same tables).
    fileParallelism: false,
  },
});
```

### `server/tests/setup.ts`

```typescript
import { execSync } from 'node:child_process';
import { beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';

// Loaded once per test run via Vitest's `setupFiles`; its hooks apply to every test file.

const prisma = new PrismaClient();

beforeAll(() => {
  // By the time this runs, DATABASE_URL has already been overridden to DATABASE_URL_TEST by the
  // `test` npm script (see server/package.json below). `migrate deploy` applies existing
  // migrations non-interactively without generating new ones — the correct command for a
  // test/CI context (as opposed to `migrate dev`, which is for local schema-authoring).
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });
});

beforeEach(async () => {
  // TRUNCATE ... CASCADE in one statement handles the JobApplication -> User foreign key and
  // resets auto-generated sequences, so every test starts from a completely empty, known state.
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "JobApplication", "User" RESTART IDENTITY CASCADE;'
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});
```

### `server/tests/helpers/testClient.ts`

```typescript
import request from 'supertest';
import app from '../../src/app';

export interface RegisteredUser {
  email: string;
  password: string;
  name: string;
  accessToken: string;
  refreshCookie: string;
  userId: string;
}

/**
 * Registers a new user via the real HTTP endpoint and returns their credentials, access token,
 * and raw `Set-Cookie` string for the refresh token — everything a test needs to act as that
 * user or exercise the refresh/logout flow.
 */
export async function registerTestUser(
  overrides?: Partial<{ email: string; password: string; name: string }>
): Promise<RegisteredUser> {
  const email =
    overrides?.email ??
    `user_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
  const password = overrides?.password ?? 'Password123!';
  const name = overrides?.name ?? 'Test User';

  const res = await request(app).post('/api/auth/register').send({ email, password, name });

  const refreshCookie = res.headers['set-cookie']?.[0] ?? '';

  return {
    email,
    password,
    name,
    accessToken: res.body.accessToken,
    refreshCookie,
    userId: res.body.user.id,
  };
}

export function authHeader(user: RegisteredUser) {
  return { Authorization: `Bearer ${user.accessToken}` };
}
```

### `server/tests/auth.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import { registerTestUser } from './helpers/testClient';

describe('Auth', () => {
  describe('POST /api/auth/register', () => {
    it('registers a new user and returns an access token + refresh cookie', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'newuser@example.com', password: 'Password123!', name: 'New User' });

      expect(res.status).toBe(201);
      expect(res.body.user).toMatchObject({ email: 'newuser@example.com', name: 'New User' });
      expect(res.body.user).not.toHaveProperty('passwordHash');
      expect(typeof res.body.accessToken).toBe('string');
      expect(res.headers['set-cookie']?.[0]).toMatch(/refreshToken=/);
    });

    it('rejects a duplicate email with 409', async () => {
      await registerTestUser({ email: 'dupe@example.com' });

      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'dupe@example.com', password: 'Password123!', name: 'Someone Else' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('EMAIL_TAKEN');
    });

    it('rejects an invalid email with 400', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'not-an-email', password: 'Password123!', name: 'Bad Email' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a short password with 400', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'shortpw@example.com', password: 'short', name: 'Short PW' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    it('logs in with correct credentials', async () => {
      const user = await registerTestUser({ email: 'login@example.com', password: 'Password123!' });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password: user.password });

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe(user.email);
      expect(typeof res.body.accessToken).toBe('string');
    });

    it('rejects a wrong password with 401', async () => {
      const user = await registerTestUser({ email: 'wrongpw@example.com' });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password: 'WrongPassword1!' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('rejects a nonexistent email with 401', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'ghost@example.com', password: 'Password123!' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns the current user with a valid token', async () => {
      const user = await registerTestUser();

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe(user.email);
    });

    it('rejects a request with no Authorization header with 401', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('NO_TOKEN');
    });

    it('rejects a malformed token with 401', async () => {
      const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer garbage');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('issues a new access token given a valid refresh cookie', async () => {
      const user = await registerTestUser();

      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', user.refreshCookie);

      expect(res.status).toBe(200);
      expect(typeof res.body.accessToken).toBe('string');
    });

    it('rejects a request with no refresh cookie with 401', async () => {
      const res = await request(app).post('/api/auth/refresh');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('NO_REFRESH_TOKEN');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('clears the refresh cookie', async () => {
      const user = await registerTestUser();

      const res = await request(app).post('/api/auth/logout').set('Cookie', user.refreshCookie);

      expect(res.status).toBe(200);
      expect(res.headers['set-cookie']?.[0]).toMatch(/refreshToken=;/);
    });
  });
});
```

### `server/tests/applications.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import { registerTestUser, authHeader, RegisteredUser } from './helpers/testClient';

describe('Applications', () => {
  let alice: RegisteredUser;
  let bob: RegisteredUser;

  beforeEach(async () => {
    alice = await registerTestUser({ email: 'alice.test@example.com' });
    bob = await registerTestUser({ email: 'bob.test@example.com' });
  });

  async function createApplicationFor(user: RegisteredUser, overrides: Record<string, unknown> = {}) {
    const res = await request(app)
      .post('/api/applications')
      .set(authHeader(user))
      .send({
        company: 'Acme Corp',
        position: 'Engineer',
        appliedAt: '2026-01-01',
        ...overrides,
      });
    return res;
  }

  describe('POST /api/applications', () => {
    it('creates an application owned by the authenticated user', async () => {
      const res = await createApplicationFor(alice);

      expect(res.status).toBe(201);
      expect(res.body.userId).toBe(alice.userId);
      expect(res.body.status).toBe('APPLIED');
    });

    it('rejects a request with no auth with 401', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send({ company: 'Acme', position: 'Eng', appliedAt: '2026-01-01' });

      expect(res.status).toBe(401);
    });

    it('rejects a missing required field with 400', async () => {
      const res = await request(app)
        .post('/api/applications')
        .set(authHeader(alice))
        .send({ position: 'Engineer', appliedAt: '2026-01-01' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/applications', () => {
    it("only returns the authenticated user's own applications", async () => {
      await createApplicationFor(alice, { company: 'Alice Co' });
      await createApplicationFor(bob, { company: 'Bob Co' });

      const res = await request(app).get('/api/applications').set(authHeader(alice));

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].company).toBe('Alice Co');
      expect(res.body).toMatchObject({ page: 1, limit: 10, total: 1, totalPages: 1 });
    });

    it('filters by status', async () => {
      await createApplicationFor(alice, { company: 'A', status: 'APPLIED' });
      await createApplicationFor(alice, { company: 'B', status: 'INTERVIEW' });

      const res = await request(app)
        .get('/api/applications?status=INTERVIEW')
        .set(authHeader(alice));

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].status).toBe('INTERVIEW');
    });

    it('searches case-insensitively by company', async () => {
      await createApplicationFor(alice, { company: 'Stark Industries' });

      const res = await request(app).get('/api/applications?search=stark').set(authHeader(alice));

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('paginates results', async () => {
      for (let i = 0; i < 3; i++) {
        await createApplicationFor(alice, { company: `Company ${i}` });
      }

      const res = await request(app)
        .get('/api/applications?limit=2&page=2')
        .set(authHeader(alice));

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.total).toBe(3);
      expect(res.body.totalPages).toBe(2);
    });
  });

  describe('GET /api/applications/stats', () => {
    it('returns total and per-status counts for only the authenticated user', async () => {
      await createApplicationFor(alice, { status: 'APPLIED' });
      await createApplicationFor(alice, { status: 'APPLIED' });
      await createApplicationFor(alice, { status: 'OFFER' });
      await createApplicationFor(bob, { status: 'REJECTED' });

      const res = await request(app).get('/api/applications/stats').set(authHeader(alice));

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(3);
      expect(res.body.byStatus).toEqual({
        APPLIED: 2,
        INTERVIEW: 0,
        REJECTED: 0,
        OFFER: 1,
        ACCEPTED: 0,
      });
    });
  });

  describe('Ownership enforcement (cross-user access)', () => {
    it("returns 404 when a user requests another user's application by id", async () => {
      const created = await createApplicationFor(alice);
      const aliceAppId = created.body.id;

      const res = await request(app)
        .get(`/api/applications/${aliceAppId}`)
        .set(authHeader(bob));

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('APPLICATION_NOT_FOUND');
    });

    it("returns 404 when a user tries to update another user's application", async () => {
      const created = await createApplicationFor(alice);
      const aliceAppId = created.body.id;

      const res = await request(app)
        .patch(`/api/applications/${aliceAppId}`)
        .set(authHeader(bob))
        .send({ status: 'OFFER' });

      expect(res.status).toBe(404);

      const stillAlices = await request(app)
        .get(`/api/applications/${aliceAppId}`)
        .set(authHeader(alice));
      expect(stillAlices.body.status).toBe('APPLIED');
    });

    it("returns 404 when a user tries to delete another user's application, and it is not deleted", async () => {
      const created = await createApplicationFor(alice);
      const aliceAppId = created.body.id;

      const res = await request(app)
        .delete(`/api/applications/${aliceAppId}`)
        .set(authHeader(bob));

      expect(res.status).toBe(404);

      const stillExists = await request(app)
        .get(`/api/applications/${aliceAppId}`)
        .set(authHeader(alice));
      expect(stillExists.status).toBe(200);
    });
  });

  describe('PATCH /api/applications/:id', () => {
    it('updates only the provided fields (partial update)', async () => {
      const created = await createApplicationFor(alice, { notes: 'original notes' });

      const res = await request(app)
        .patch(`/api/applications/${created.body.id}`)
        .set(authHeader(alice))
        .send({ status: 'INTERVIEW' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('INTERVIEW');
      expect(res.body.notes).toBe('original notes');
    });

    it('rejects an empty update body with 400', async () => {
      const created = await createApplicationFor(alice);

      const res = await request(app)
        .patch(`/api/applications/${created.body.id}`)
        .set(authHeader(alice))
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/applications/:id', () => {
    it("deletes the authenticated user's own application", async () => {
      const created = await createApplicationFor(alice);

      const res = await request(app)
        .delete(`/api/applications/${created.body.id}`)
        .set(authHeader(alice));

      expect(res.status).toBe(204);

      const getRes = await request(app)
        .get(`/api/applications/${created.body.id}`)
        .set(authHeader(alice));
      expect(getRes.status).toBe(404);
    });
  });
});
```

### `server/package.json` (updated — full file, adds test scripts and devDependencies)

```json
{
  "name": "server",
  "private": true,
  "version": "1.0.0",
  "type": "commonjs",
  "main": "dist/server.js",
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  },
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:studio": "prisma studio",
    "prisma:seed": "prisma db seed",
    "test": "dotenv -e .env -o -- cross-env DATABASE_URL=$DATABASE_URL_TEST vitest run",
    "test:watch": "dotenv -e .env -o -- cross-env DATABASE_URL=$DATABASE_URL_TEST vitest"
  },
  "dependencies": {
    "@prisma/client": "^5.19.0",
    "bcrypt": "^5.1.1",
    "cookie-parser": "^1.4.6",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "jsonwebtoken": "^9.0.2",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/bcrypt": "^5.0.2",
    "@types/cookie-parser": "^1.4.7",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.6",
    "@types/node": "^20.14.9",
    "@types/supertest": "^6.0.2",
    "cross-env": "^7.0.3",
    "dotenv-cli": "^7.4.2",
    "prisma": "^5.19.0",
    "supertest": "^7.0.0",
    "tsx": "^4.16.2",
    "typescript": "^5.5.3",
    "vitest": "^2.0.5"
  }
}
```

> `cross-env` is added alongside `dotenv-cli` so the `DATABASE_URL=$DATABASE_URL_TEST`
> substitution works identically on Windows PowerShell, cmd.exe, and POSIX shells — `dotenv-cli`
> loads `.env` into the process environment (making `DATABASE_URL_TEST` available), and
> `cross-env` then cross-platform-assigns `DATABASE_URL` from it before Vitest (and, inside
> `tests/setup.ts`, `prisma migrate deploy` and `PrismaClient`) starts, so the entire test run
> operates against `job_tracker_test`, never the real development database. Install it alongside
> the other test dependencies:
> ```bash
> cd server
> npm install -D cross-env
> cd ..
> ```

All other files (`app.ts`, `server.ts`, `routes/*`, `controllers/*`, `services/*`,
`middlewares/*`, `schemas/*`, `utils/*`, `types/*`, `config/*`, `prisma/schema.prisma`) are
unchanged from Phase 6.

## How It Works — tracing one request

Running `npm run test` (from `server/`):

1. `dotenv -e .env -o --` loads all variables from `server/.env` into the process environment
   (`-o` means "override" any already-set values), making `DATABASE_URL_TEST` available.
2. `cross-env DATABASE_URL=$DATABASE_URL_TEST vitest run` then sets `DATABASE_URL` to the value
   of `DATABASE_URL_TEST` for the child process, and starts Vitest.
3. Vitest reads `vitest.config.ts`, sees `setupFiles: ['./tests/setup.ts']`, and runs that file's
   top-level code once, registering its `beforeAll`/`beforeEach`/`afterAll` hooks globally.
4. Before any test runs, the `beforeAll` hook executes `npx prisma migrate deploy` as a child
   process. Since `DATABASE_URL` is now `job_tracker_test`'s connection string, this applies all
   existing migrations to the test database (safe to re-run; a no-op if already up to date).
5. Vitest discovers `tests/auth.test.ts` and `tests/applications.test.ts` and, for each `it(...)`
   block, first runs the global `beforeEach` (truncating `JobApplication` and `User`), then any
   file-local `beforeEach` (e.g. `applications.test.ts`'s, which registers fresh `alice`/`bob`
   users for that test), then the test body itself.
6. Inside a test body, `request(app).post('/api/auth/register').send({...})` uses Supertest to
   invoke the exact same Express `app` object built in `src/app.ts` — no HTTP port is bound; the
   request is dispatched in-process directly into Express's routing/middleware stack, exercising
   the real `authenticate`, `validate`, controller, service, and Prisma layers against the real
   (test) database, and returning a real `Response` object your assertions inspect.
7. For the ownership test: `alice` creates an application via a real `POST`; the test then
   issues a real `GET` for that same id but with `bob`'s access token attached. The request
   flows through the genuine `authenticate` → `application.service.getApplicationById` code path
   used in production, which runs `findFirst({ where: { id, userId: bob.id } })` against
   Postgres and finds no row — proving the security property with a real database query, not a
   mock.

## End-to-end example

```bash
cd server
npm run test
```

Expected terminal output (abbreviated):

```
✓ tests/auth.test.ts (12)
✓ tests/applications.test.ts (15)

Test Files  2 passed (2)
     Tests  27 passed (27)
```

(Exact test counts depend on exactly how many `it(...)` blocks you've written; the suite above
totals roughly a dozen auth tests and a dozen-plus application tests.)

## Test This Phase

1. `cd server && npm run test` — expect all tests to pass, and confirm (e.g. via
   `npx prisma studio` pointed at `DATABASE_URL_TEST`, or just trusting the truncate logic) that
   the real development database (`job_tracker`) is untouched — only `job_tracker_test` is
   affected.
2. Intentionally break ownership enforcement (temporarily change
   `getApplicationById`'s Prisma call from `findFirst({ where: { id, userId } })` to
   `findUnique({ where: { id } })` without a userId check) and re-run the suite — expect the
   three "Ownership enforcement" tests to fail, proving they actually catch the regression.
   Revert the change afterward.
3. Run `npm run test:watch` and edit a test file — expect Vitest to re-run only the affected
   file(s) automatically.
4. Stop your local PostgreSQL server and re-run `npm run test` — expect the `beforeAll` hook's
   `prisma migrate deploy` (or the first Prisma query) to fail loudly with a connection error,
   not a silent pass.
5. Run the suite twice in a row without restarting anything — expect identical pass results
   both times (proving the `beforeEach` truncation makes tests fully independent/repeatable).

**Failure indicators:**
- Tests pass individually but fail when run together → likely a truncation or ordering issue;
  confirm `fileParallelism: false` is set and `beforeEach` truncation is registered globally in
  `tests/setup.ts`, not duplicated/skipped in individual files.
- `relation "User" does not exist` inside the test run → `DATABASE_URL` wasn't actually
  overridden to the test database before `prisma migrate deploy` ran; check the `test` script's
  environment variable substitution on your OS/shell.
- Flaky duplicate-email tests → confirm `registerTestUser`'s default email generation
  (timestamp + random suffix) is being used, or that `beforeEach` truncation is actually running
  before each test.

## Common Failure Points

- Running the test suite against `DATABASE_URL` (the real dev database) by mistake — always
  verify the `test` npm script's environment override actually takes effect; a mistake here
  would silently wipe your development data via the `TRUNCATE` in `tests/setup.ts`.
- Forgetting `RESTART IDENTITY` in the `TRUNCATE` statement — not strictly required here since
  this schema uses UUID primary keys (no auto-increment sequences to reset), but it's included
  defensively and is a good habit for schemas that do use serial ids.
- Supertest requests to a route requiring `Content-Type: application/json` failing silently —
  Supertest's `.send(object)` sets this header automatically; only an issue if you build raw
  string bodies.

## Common Mistakes

- Mocking Prisma/the database in these tests — this project's testing philosophy (per the spec)
  is integration-style tests against a real test database, specifically to catch real query
  bugs (like the ownership `findFirst` vs `findUnique` distinction) that a mocked Prisma client
  would never expose.
- Sharing mutable state (e.g. a single `alice` user) across test files instead of re-registering
  fresh users in each file's own `beforeEach` — since tables are truncated between every test,
  any user reference from a previous test is invalid in the next one.
- Forgetting to assert on `res.body.error.code` (the machine-readable code) in addition to
  `res.status` — asserting only the status code can hide a regression where the right status is
  returned for the wrong reason.

## Checkpoint

**What now works:**
- `npm run test` (in `server/`) runs a full Vitest + Supertest suite against a real, isolated
  test database, covering auth success/failure paths, applications CRUD happy paths, validation
  failures, and — the most important security property of the whole backend — that cross-user
  access to another user's application is blocked with 404 at every mutating and reading
  endpoint.
- The entire backend track (Phases 1–7) is now complete and independently verifiable both
  manually (curl) and automatically (this test suite).

**What you should understand before continuing:**
- Why the test database is truncated between tests rather than dropped/recreated (speed, while
  still guaranteeing isolation).
- Why these are integration tests against a real database rather than unit tests with a mocked
  Prisma client, and what class of bugs that choice is designed to catch.
- That the backend's public contract (every endpoint, request/response shape, and status code)
  is now fixed and should not change without also updating this test suite.

## Preparation for the Next Phase

The backend track (Phases 1–7) is complete. Phase 8 begins the frontend track
(`PHASE-08-frontend-foundation.md`, owned separately) building the Vite React app shell — Router,
Redux store shell, TanStack Query client, Tailwind layout — that will eventually consume this
exact API. No further backend changes are required to start frontend work; the API contract
fixed across Phases 4–6 (endpoints, request/response shapes, status codes) is what the frontend
track builds against.
