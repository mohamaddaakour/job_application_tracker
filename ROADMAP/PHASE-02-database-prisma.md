# Phase 2 — Database & Prisma

## Goal

Introduce PostgreSQL and Prisma into `server/`, create the exact `User`/`JobApplication` data
model from the architecture spec, run the first migration against a real local PostgreSQL
database, and write a seed script that populates demo data. By the end of this phase,
`npx prisma studio` (run from `server/`) shows populated `User` and `JobApplication` tables.

## Prerequisites

- Phase 1 complete: monorepo scaffold running, `npm run dev` works from the root.
- A local PostgreSQL server installed and running, reachable at `localhost:5432` with a
  `postgres` user whose password is `postgres` (matching the spec's `DATABASE_URL`). If your
  local Postgres uses different credentials, adjust `server/.env` accordingly — but keep the
  variable **names** (`DATABASE_URL`, `DATABASE_URL_TEST`) exactly as specified.
- Two empty databases created ahead of time (Prisma will not create the server, only the schema
  inside an existing database... actually Prisma migrate *can* create the database if it doesn't
  exist, given valid connection credentials to the Postgres server):
  ```sql
  CREATE DATABASE job_tracker;
  CREATE DATABASE job_tracker_test;
  ```
  (The test database is not used until Phase 7, but it's convenient to create it now.)

## What's intentionally deferred

- No Express routes touch Prisma yet — that begins in Phase 3 (`/api/health` will run a real
  query) and Phase 4/5 (real auth/CRUD queries).
- No password-hashing utility module yet — the seed script inlines a one-off bcrypt hash purely
  for seeding purposes, explicitly noted below as pre-dating the real auth utility built in
  Phase 4.
- No test database usage yet (`DATABASE_URL_TEST` is defined in `.env` but unused until Phase 7).

## Concepts learned

- Prisma schema modeling: models, enums, relations (`@relation`), cascading deletes
  (`onDelete: Cascade`), indexes (`@@index`).
- Prisma Migrate: `prisma migrate dev` to create and apply a versioned SQL migration from schema
  changes.
- Prisma Client generation and a singleton pattern for reusing one client instance across the
  app (introduced here in `config/prisma.ts`, used by every later phase).
- Seeding a database with a `prisma/seed.ts` script wired via `package.json`'s `prisma.seed`
  config, run automatically by `prisma migrate reset` or manually via `prisma db seed`.
- Inspecting data visually with `npx prisma studio`.

## Complete project directory structure (end of Phase 2)

```
job_application_tracker/
├── package.json
├── .gitignore
├── README.md
├── subject.md
├── ROADMAP/
│   └── ... (unchanged from Phase 1)
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   ├── .env
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── seed.ts
│   │   └── migrations/
│   │       ├── migration_lock.toml
│   │       └── 20240101000000_init/
│   │           └── migration.sql
│   └── src/
│       ├── app.ts
│       ├── server.ts
│       └── config/
│           └── prisma.ts
└── client/
    └── ... (unchanged from Phase 1)
```

> The migration folder name is a timestamp generated automatically by Prisma at the moment you
> run `prisma migrate dev` (format `YYYYMMDDHHMMSS_init`); the name shown above is illustrative.

## Step-by-step implementation

### 1. Install Prisma and bcrypt in `server/`

```bash
cd server
npm install @prisma/client bcrypt
npm install -D prisma @types/bcrypt
cd ..
```

### 2. Initialize Prisma

```bash
cd server
npx prisma init
cd ..
```

This creates `server/prisma/schema.prisma` (default template) and confirms `server/.env` exists
(it already does, from Phase 1). Overwrite the generated `schema.prisma` with the exact content
below.

### 3. Write the exact Prisma schema from the spec

(See `server/prisma/schema.prisma` below — copied verbatim from the architecture spec, with the
`generator`/`datasource` blocks added.)

### 4. Create the Prisma client singleton

Create `server/src/config/prisma.ts` (see full code below).

### 5. Run the first migration

```bash
cd server
npx prisma migrate dev --name init
cd ..
```

This creates `server/prisma/migrations/<timestamp>_init/migration.sql`, applies it to the
`job_tracker` database, and regenerates the Prisma Client into `node_modules/@prisma/client`.

### 6. Write the seed script

Create `server/prisma/seed.ts` (see full code below).

### 7. Wire the seed script into `server/package.json`

Add a `"prisma": { "seed": "tsx prisma/seed.ts" }` block (see updated `server/package.json`
below).

### 8. Run the seed script

```bash
cd server
npx prisma db seed
cd ..
```

### 9. Inspect the data

```bash
cd server
npx prisma studio
cd ..
```

This opens a browser tab (default `http://localhost:5555`) showing the `User` and
`JobApplication` tables with the seeded rows.

## Exact package installs (summary)

```bash
cd server
npm install @prisma/client bcrypt
npm install -D prisma @types/bcrypt
cd ..
```

## Full file contents

### `server/prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id           String           @id @default(uuid())
  email        String           @unique
  passwordHash String
  name         String
  applications JobApplication[]
  createdAt    DateTime         @default(now())
  updatedAt    DateTime         @updatedAt
}

enum ApplicationStatus {
  APPLIED
  INTERVIEW
  REJECTED
  OFFER
  ACCEPTED
}

model JobApplication {
  id        String            @id @default(uuid())
  company   String
  position  String
  location  String?
  jobUrl    String?
  status    ApplicationStatus @default(APPLIED)
  appliedAt DateTime
  notes     String?
  userId    String
  user      User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime          @default(now())
  updatedAt DateTime          @updatedAt

  @@index([userId])
}
```

### `server/src/config/prisma.ts`

```typescript
import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// Reuse a single PrismaClient instance across the process (important with tsx watch's
// module-reload behavior in dev, and standard practice in general to avoid exhausting the
// Postgres connection pool with multiple clients).
const prisma = global.__prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}

export default prisma;
```

### `server/prisma/seed.ts`

```typescript
// Seed script for local development data.
//
// NOTE on password hashing: this seed script predates the real authentication system built in
// Phase 4 (server/src/utils/hash.ts). Phase 4 introduces the actual bcrypt hashing utility used
// by the register/login endpoints. For this seed script, we inline a one-off bcrypt hash call
// directly (bcrypt is already a dependency for that reason) so seeded users have a valid,
// real bcrypt hash and can genuinely log in once Phase 4's /api/auth/login exists — the
// placeholder password for every seeded user is `Password123!`.
import { PrismaClient, ApplicationStatus } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const SEED_PASSWORD = 'Password123!';
const SALT_ROUNDS = 10;

async function main() {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, SALT_ROUNDS);

  // Clean slate: delete in child-then-parent order to respect the foreign key.
  await prisma.jobApplication.deleteMany();
  await prisma.user.deleteMany();

  const alice = await prisma.user.create({
    data: {
      email: 'alice@example.com',
      passwordHash,
      name: 'Alice Johnson',
    },
  });

  const bob = await prisma.user.create({
    data: {
      email: 'bob@example.com',
      passwordHash,
      name: 'Bob Smith',
    },
  });

  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

  await prisma.jobApplication.createMany({
    data: [
      {
        userId: alice.id,
        company: 'Acme Corp',
        position: 'Frontend Engineer',
        location: 'Remote',
        jobUrl: 'https://acme.example.com/jobs/1',
        status: ApplicationStatus.APPLIED,
        appliedAt: daysAgo(10),
        notes: 'Applied via referral.',
      },
      {
        userId: alice.id,
        company: 'Globex',
        position: 'Full Stack Developer',
        location: 'New York, NY',
        jobUrl: 'https://globex.example.com/careers/42',
        status: ApplicationStatus.INTERVIEW,
        appliedAt: daysAgo(20),
        notes: 'Phone screen scheduled.',
      },
      {
        userId: alice.id,
        company: 'Initech',
        position: 'Backend Engineer',
        location: null,
        jobUrl: null,
        status: ApplicationStatus.REJECTED,
        appliedAt: daysAgo(30),
        notes: 'Rejected after final round.',
      },
      {
        userId: alice.id,
        company: 'Umbrella Inc',
        position: 'Software Engineer II',
        location: 'Boston, MA',
        jobUrl: 'https://umbrella.example.com/jobs/9',
        status: ApplicationStatus.OFFER,
        appliedAt: daysAgo(5),
        notes: 'Offer received, negotiating.',
      },
      {
        userId: bob.id,
        company: 'Hooli',
        position: 'DevOps Engineer',
        location: 'Remote',
        jobUrl: null,
        status: ApplicationStatus.APPLIED,
        appliedAt: daysAgo(2),
        notes: null,
      },
      {
        userId: bob.id,
        company: 'Soylent',
        position: 'Platform Engineer',
        location: 'Austin, TX',
        jobUrl: 'https://soylent.example.com/jobs/3',
        status: ApplicationStatus.ACCEPTED,
        appliedAt: daysAgo(45),
        notes: 'Accepted, starting next month.',
      },
    ],
  });

  console.log('Seed complete:');
  console.log(`  Users: alice@example.com / bob@example.com (password: ${SEED_PASSWORD})`);
  console.log('  JobApplications: 6 rows across APPLIED/INTERVIEW/REJECTED/OFFER/ACCEPTED');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

### `server/package.json` (updated — adds Prisma deps, seed config, and prisma scripts)

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
    "prisma:seed": "prisma db seed"
  },
  "dependencies": {
    "@prisma/client": "^5.19.0",
    "bcrypt": "^5.1.1",
    "cookie-parser": "^1.4.6",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2"
  },
  "devDependencies": {
    "@types/bcrypt": "^5.0.2",
    "@types/cookie-parser": "^1.4.7",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/node": "^20.14.9",
    "prisma": "^5.19.0",
    "tsx": "^4.16.2",
    "typescript": "^5.5.3"
  }
}
```

### `server/src/app.ts` (unchanged from Phase 1)

```typescript
import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

const app: Application = express();

app.use(
  cors({
    origin: process.env.CLIENT_URL ?? 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

app.get('/', (_req: Request, res: Response) => {
  res.json({ message: 'ok' });
});

export default app;
```

### `server/src/server.ts` (unchanged from Phase 1)

```typescript
import 'dotenv/config';
import app from './app';

const PORT = process.env.PORT ?? 4000;

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
```

### `server/.env` (unchanged shape from Phase 1 — now `DATABASE_URL` is actually used)

```
NODE_ENV=development
PORT=4000
CLIENT_URL=http://localhost:5173
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/job_tracker?schema=public
DATABASE_URL_TEST=postgresql://postgres:postgres@localhost:5432/job_tracker_test?schema=public
JWT_ACCESS_SECRET=change_me_access
JWT_REFRESH_SECRET=change_me_refresh
ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d
```

## How It Works — tracing one request

Since no route touches Prisma yet, the "request" for this phase is the Prisma Migrate/seed
workflow itself, not an HTTP request:

1. `npx prisma migrate dev --name init` reads `server/prisma/schema.prisma`, computes the SQL
   needed to bring the `job_tracker` database's schema from empty to matching the `User`,
   `JobApplication`, and `ApplicationStatus` definitions, writes that SQL into a new
   `prisma/migrations/<timestamp>_init/migration.sql` file, and executes it against
   `DATABASE_URL` from `server/.env`.
2. Prisma also records the applied migration's checksum in a `_prisma_migrations` table inside
   the database itself, so future `migrate dev`/`migrate deploy` runs know what's already
   applied.
3. Prisma then regenerates the type-safe `@prisma/client` package based on the schema, giving
   you `prisma.user.create(...)`, `prisma.jobApplication.createMany(...)`, etc. with full
   TypeScript types matching the schema's fields and the `ApplicationStatus` enum.
4. `npx prisma db seed` runs `tsx prisma/seed.ts` (per the `"prisma": { "seed": ... }` config in
   `package.json`). The script imports `PrismaClient` directly (a separate instance from the
   app's singleton — seed scripts are standalone CLI runs, not part of the running Express app),
   hashes the placeholder password once, deletes any existing rows (child table first to satisfy
   the foreign key), creates two `User` rows, then bulk-creates six `JobApplication` rows spread
   across all five status values and both users.
5. `npx prisma studio` starts a local web server that reads the same `DATABASE_URL` and lets you
   browse/edit rows in a generated UI — purely a development inspection tool, not part of the
   running application.

## End-to-end example

```bash
cd server
npx prisma studio
```

Expected: a browser tab opens at `http://localhost:5555` listing the `User` and `JobApplication`
models in a sidebar. Clicking `User` shows 2 rows (`alice@example.com`, `bob@example.com`) each
with a non-empty `passwordHash` (a `$2b$10$...` bcrypt string) and a `name`. Clicking
`JobApplication` shows 6 rows with `company`/`position`/`status` values matching the seed script,
each `userId` matching one of the two seeded users.

As a database-level sanity check, you can also run:

```bash
cd server
npx prisma db execute --stdin <<< "SELECT status, count(*) FROM \"JobApplication\" GROUP BY status;"
```

Expected output: five rows, one per `ApplicationStatus` value: `APPLIED` with `count = 2`
(Acme Corp and Hooli), and `INTERVIEW`, `REJECTED`, `OFFER`, `ACCEPTED` each with `count = 1` —
6 rows total, matching the seed script above.

## Test This Phase

1. `cd server && npx prisma migrate dev --name init` — expect output ending in
   `Your database is now in sync with your schema.` and a new folder under
   `server/prisma/migrations/`.
2. `cd server && npx prisma db seed` — expect the console log lines from `seed.ts`
   (`Seed complete: ...`) with no errors.
3. `cd server && npx prisma studio` — expect the browser UI to open and show 2 `User` rows and 6
   `JobApplication` rows.
4. Re-run `npx prisma db seed` a second time — expect it to succeed again with no duplicate-key
   errors (the script deletes existing rows first, so it's idempotent).
5. `npm run dev` from the repo root (Phase 1's server/client) still works exactly as before —
   Prisma being installed does not change the `/` hello-world route's behavior yet.

**Failure indicators:**
- `Error: P1001: Can't reach database server` → PostgreSQL isn't running, or `DATABASE_URL`
  host/port/credentials are wrong.
- `Error: P3009` (failed migrations) → a previous partial migration attempt left the database in
  a bad state; for local dev only, `npx prisma migrate reset` drops and recreates the database
  and re-runs seeding (destructive — never run against a database with data you care about).
- `relation "User" does not exist` when running raw SQL → migration wasn't applied; re-run
  `npx prisma migrate dev`.

## Common Failure Points

- Forgetting that Prisma model names are singular/PascalCase (`User`, `JobApplication`) while
  the actual Postgres table names Prisma creates match those names by default (no `@@map`
  override is used here, matching the spec) — don't assume snake_case table names when writing
  raw SQL.
- Running `prisma migrate dev` against `DATABASE_URL_TEST` by accident — always confirm which
  `.env` variable is active; Phase 7 addresses the test database properly with a dedicated
  setup flow.
- Forgetting `onDelete: Cascade` behavior: deleting a `User` row also deletes all of that user's
  `JobApplication` rows. This is intentional and matches the spec, but is worth understanding
  before relying on it in tests.
- bcrypt's native bindings occasionally fail to install on some systems (node-gyp/build tool
  issues); if `npm install bcrypt` fails, ensure build tools are present, or note that
  `bcryptjs` (pure JS) is a common fallback — this project uses native `bcrypt` as specified.

## Common Mistakes

- Editing a migration's `.sql` file by hand after it's been applied — migrations are meant to be
  immutable history; instead change `schema.prisma` and run `prisma migrate dev` again to
  generate a new migration.
- Forgetting to run `npx prisma generate` after pulling schema changes on a fresh clone (though
  `prisma migrate dev` runs generate automatically; a plain `npm install` does too, via Prisma's
  postinstall hook, but it's good practice to know `prisma generate` exists as a standalone
  step).
- Putting real production secrets in `.env.example` — it should only show variable *names* with
  placeholder/example values, which the spec's version already does.

## Checkpoint

**What now works:**
- A real PostgreSQL database (`job_tracker`) exists with `User` and `JobApplication` tables
  matching the spec's schema exactly, plus an `ApplicationStatus` enum type.
- `npx prisma studio` shows seeded demo data: 2 users, 6 job applications across all 5 statuses.
- A reusable Prisma Client singleton exists at `server/src/config/prisma.ts`, ready to be used by
  real routes starting in Phase 3.

**What you should understand before continuing:**
- How Prisma migrations map schema changes to versioned SQL files.
- Why a single shared `PrismaClient` instance (the singleton pattern in `config/prisma.ts`)
  matters for connection pooling.
- That the seed script's inline bcrypt call is a stand-in — Phase 4 introduces the real,
  reusable password-hashing utility used by the actual auth endpoints.

## Preparation for the Next Phase

Phase 3 builds the full layered Express folder structure (`routes/`, `controllers/`,
`services/`, `middlewares/`, `schemas/`, `utils/`, `types/`) and introduces the first route that
actually queries the database through Prisma: `GET /api/health`. Before starting Phase 3:
- Keep `job_tracker` running and seeded — Phase 3's health check will use
  `prisma.user.count()` to prove connectivity.
- No client changes are needed to start Phase 3.
