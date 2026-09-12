# Phase 3 — Express Architecture

## Goal

Introduce the full layered backend folder structure defined in the spec
(`routes/`, `controllers/`, `services/`, `middlewares/`, `schemas/`, `utils/`, `types/`), the
shared `AppError` class, `asyncHandler` wrapper, and a central `errorHandler` middleware. Prove
the whole stack works end-to-end with one real endpoint: `GET /api/health`, which flows
routes → controller → service → Prisma → PostgreSQL and back.

## Prerequisites

- Phase 2 complete: `job_tracker` database exists, migrated, and seeded; Prisma Client
  singleton exists at `server/src/config/prisma.ts`.
- PostgreSQL still running locally.

## What's intentionally deferred

- No authentication yet (Phase 4) — `/api/health` requires no auth.
- No `applications` routes/controllers/services yet (Phase 5).
- No Zod schemas with real validation rules yet — the `schemas/` folder is created but only a
  placeholder pattern is demonstrated conceptually; real Zod schemas (`auth.schema.ts`,
  `application.schema.ts`) arrive in Phase 4 and Phase 5 respectively, since there's nothing to
  validate yet for a parameterless health check.
- No `validate(schema)` middleware usage yet (it has nothing to validate against in this phase);
  the middleware itself is introduced here as `middlewares/validate.middleware.ts` since it's a
  generic, reusable piece of the architecture, but it is first actually wired into a route in
  Phase 4.

## Concepts learned

- Layered architecture: separating HTTP concerns (routes, controllers) from business logic
  (services) from cross-cutting concerns (middlewares) from data validation (schemas) from
  shared helpers (utils, types).
- Centralized error handling in Express: a custom `AppError` class carrying an HTTP status code
  and machine-readable `code`, thrown from anywhere in the call stack, caught by one
  `errorHandler` middleware registered last in `app.ts`.
- `asyncHandler`: a higher-order function that wraps async route handlers so a rejected promise
  (a thrown error inside an `async` controller) is forwarded to Express's `next()` instead of
  crashing the process or hanging the request.
- Proving a full-stack request path with a deliberately simple endpoint before adding real
  domain logic.

## Complete project directory structure (end of Phase 3)

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
│   ├── .env.example
│   ├── .env
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── seed.ts
│   │   └── migrations/
│   │       └── <timestamp>_init/
│   │           └── migration.sql
│   └── src/
│       ├── app.ts
│       ├── server.ts
│       ├── config/
│       │   ├── env.ts
│       │   └── prisma.ts
│       ├── routes/
│       │   ├── index.ts
│       │   └── health.routes.ts
│       ├── controllers/
│       │   └── health.controller.ts
│       ├── services/
│       │   └── health.service.ts
│       ├── middlewares/
│       │   ├── error.middleware.ts
│       │   └── validate.middleware.ts
│       ├── schemas/
│       │   └── (empty — populated starting Phase 4)
│       ├── utils/
│       │   ├── AppError.ts
│       │   └── asyncHandler.ts
│       └── types/
│           └── (empty — populated starting Phase 4)
└── client/
    └── ... (unchanged)
```

> Empty directories are not tracked by git; create a `.gitkeep` file inside `schemas/` and
> `types/` if you want them to appear in the repo before Phase 4 adds real files to them. This
> is optional and has no effect on the application.

## Step-by-step implementation

### 1. Create the new folders

```bash
cd server/src
mkdir routes controllers services middlewares schemas utils types
cd ../..
```

### 2. Create `config/env.ts` — a single typed source of truth for environment variables

This centralizes `process.env` access (previously read ad hoc in `app.ts`/`server.ts`) so every
later phase imports validated config from one place instead of scattering `process.env.X`
reads throughout the codebase.

### 3. Create `utils/AppError.ts` and `utils/asyncHandler.ts`

### 4. Create `middlewares/error.middleware.ts` and `middlewares/validate.middleware.ts`

### 5. Create the health check vertical slice: `services/health.service.ts` →
   `controllers/health.controller.ts` → `routes/health.routes.ts` → `routes/index.ts`

### 6. Update `app.ts` to mount `/api` routes and register the error handler last

### 7. Update `server.ts` to use `config/env.ts`

No new npm packages are required for this phase — it is a pure refactor/structure phase using
only what Phase 1–2 already installed.

## Exact package installs (summary)

None — Phase 3 introduces no new dependencies.

## Full file contents

### `server/src/config/env.ts`

```typescript
import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  NODE_ENV: required('NODE_ENV', 'development'),
  PORT: Number(required('PORT', '4000')),
  CLIENT_URL: required('CLIENT_URL', 'http://localhost:5173'),
  DATABASE_URL: required('DATABASE_URL'),
  DATABASE_URL_TEST: process.env.DATABASE_URL_TEST,
  JWT_ACCESS_SECRET: required('JWT_ACCESS_SECRET'),
  JWT_REFRESH_SECRET: required('JWT_REFRESH_SECRET'),
  ACCESS_TOKEN_EXPIRES_IN: required('ACCESS_TOKEN_EXPIRES_IN', '15m'),
  REFRESH_TOKEN_EXPIRES_IN: required('REFRESH_TOKEN_EXPIRES_IN', '7d'),
};
```

### `server/src/config/prisma.ts` (unchanged from Phase 2)

```typescript
import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

const prisma = global.__prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}

export default prisma;
```

### `server/src/utils/AppError.ts`

```typescript
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code?: string;
  public readonly details?: unknown;

  constructor(statusCode: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, code?: string, details?: unknown) {
    return new AppError(400, message, code, details);
  }

  static unauthorized(message = 'Unauthorized', code?: string) {
    return new AppError(401, message, code);
  }

  static forbidden(message = 'Forbidden', code?: string) {
    return new AppError(403, message, code);
  }

  static notFound(message = 'Not found', code?: string) {
    return new AppError(404, message, code);
  }

  static conflict(message: string, code?: string) {
    return new AppError(409, message, code);
  }

  static internal(message = 'Internal server error', code?: string) {
    return new AppError(500, message, code);
  }
}
```

### `server/src/utils/asyncHandler.ts`

```typescript
import { NextFunction, Request, Response } from 'express';

type AsyncRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<unknown>;

/**
 * Wraps an async Express handler so any rejected promise (thrown error inside an `async`
 * controller) is forwarded to `next()`, letting the central error middleware handle it instead
 * of the request hanging or the process crashing on an unhandled rejection.
 */
export function asyncHandler(fn: AsyncRouteHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
```

### `server/src/middlewares/error.middleware.ts`

```typescript
import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/AppError';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: {
        message: err.message,
        ...(err.code ? { code: err.code } : {}),
        ...(err.details ? { details: err.details } : {}),
      },
    });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: err.issues,
      },
    });
  }

  console.error(err);
  return res.status(500).json({
    error: {
      message: 'Internal server error',
    },
  });
}
```

> `zod` is imported here in anticipation of Phase 4's validation middleware throwing `ZodError`
> instances; it is added as a dependency in Phase 4 when the `validate` middleware first parses
> a schema. For Phase 3 alone (before Phase 4 installs `zod`), this import will fail to resolve.
> To keep Phase 3 runnable in isolation, install `zod` now:
> ```bash
> cd server
> npm install zod
> cd ..
> ```
> This is listed in this phase's package installs below so Phase 3 is fully runnable on its own.

### `server/src/middlewares/validate.middleware.ts`

```typescript
import { NextFunction, Request, Response } from 'express';
import { AnyZodObject, ZodError } from 'zod';

/**
 * Generic request-validation middleware. Accepts a Zod object schema shaped like
 * `{ body?: ZodSchema, query?: ZodSchema, params?: ZodSchema }` and parses/replaces the
 * matching parts of `req` with the parsed (and thus type-coerced/defaulted) result.
 * On failure, forwards the ZodError to the central error handler, which formats it into the
 * spec's `{ error: { message, code, details } }` shape with a 400 status.
 */
export function validate(schema: AnyZodObject) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      if (parsed.body) req.body = parsed.body;
      if (parsed.query) req.query = parsed.query;
      if (parsed.params) req.params = parsed.params;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return next(err);
      }
      next(err);
    }
  };
}
```

### `server/src/services/health.service.ts`

```typescript
import prisma from '../config/prisma';

export interface HealthReport {
  status: 'ok';
  timestamp: string;
  database: 'connected';
  userCount: number;
}

export async function getHealthReport(): Promise<HealthReport> {
  // A real Prisma query against the database — proves the connection is alive, not just that
  // the process is running.
  const userCount = await prisma.user.count();

  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: 'connected',
    userCount,
  };
}
```

### `server/src/controllers/health.controller.ts`

```typescript
import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { getHealthReport } from '../services/health.service';

export const getHealth = asyncHandler(async (_req: Request, res: Response) => {
  const report = await getHealthReport();
  res.status(200).json(report);
});
```

### `server/src/routes/health.routes.ts`

```typescript
import { Router } from 'express';
import { getHealth } from '../controllers/health.controller';

const router = Router();

router.get('/health', getHealth);

export default router;
```

### `server/src/routes/index.ts`

```typescript
import { Router } from 'express';
import healthRoutes from './health.routes';

const router = Router();

router.use(healthRoutes);

export default router;
```

> Later phases (`auth.routes.ts`, `application.routes.ts`) will each add one `router.use(...)`
> line here — this file is the single place all `/api/*` sub-routers are combined.

### `server/src/app.ts` (updated — mounts `/api`, registers error handler last)

```typescript
import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import routes from './routes';
import { errorHandler } from './middlewares/error.middleware';
import { env } from './config/env';

const app: Application = express();

app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

app.get('/', (_req: Request, res: Response) => {
  res.json({ message: 'ok' });
});

app.use('/api', routes);

// Central error handler must be registered last, after all routes.
app.use(errorHandler);

export default app;
```

### `server/src/server.ts` (updated — uses `env`)

```typescript
import app from './app';
import { env } from './config/env';

app.listen(env.PORT, () => {
  console.log(`Server listening on http://localhost:${env.PORT}`);
});
```

### `server/package.json` (updated — adds `zod`)

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
    "express": "^4.19.2",
    "zod": "^3.23.8"
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

Install command for this phase:

```bash
cd server
npm install zod
cd ..
```

## How It Works — tracing one request

`GET http://localhost:4000/api/health`:

1. Express receives the request. It passes through `cors` (validates the `Origin` header),
   `express.json()` (no-op, no body), and `cookieParser()` (no cookies needed here).
2. `app.use('/api', routes)` strips the `/api` prefix and hands the remaining path (`/health`) to
   the combined router in `routes/index.ts`.
3. `routes/index.ts` has mounted `health.routes.ts` at its root, so `/health` matches
   `router.get('/health', getHealth)` inside `health.routes.ts`.
4. `getHealth` (in `controllers/health.controller.ts`) is wrapped in `asyncHandler`. It calls
   `getHealthReport()` from `services/health.service.ts` and `await`s it.
5. `getHealthReport()` calls `prisma.user.count()` — a real SQL `SELECT COUNT(*) FROM "User"`
   query executed against the `job_tracker` database through the Prisma Client singleton from
   `config/prisma.ts`.
6. The service returns a plain object; the controller sets HTTP 200 and calls
   `res.json(report)`.
7. If anything above throws (e.g. Postgres is down, so `prisma.user.count()` rejects),
   `asyncHandler`'s `.catch(next)` forwards the error to Express's `next()`, which skips all
   remaining regular middleware/routes and invokes `errorHandler` (registered last in `app.ts`).
   Since a raw Prisma connection error is neither an `AppError` nor a `ZodError`, `errorHandler`
   falls through to its generic branch: logs the error server-side and responds
   `500 { "error": { "message": "Internal server error" } }` — never leaking the raw database
   error to the client.

## End-to-end example

```bash
curl -i http://localhost:4000/api/health
```

Expected response (assuming the Phase 2 seed data with 2 users is still in the database):

```
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

{"status":"ok","timestamp":"2026-01-01T12:00:00.000Z","database":"connected","userCount":2}
```

(The exact `timestamp` value will differ; `userCount` reflects however many `User` rows
currently exist.)

## Test This Phase

1. `npm run dev` from the repo root.
2. `curl http://localhost:4000/` — expect the unchanged `{"message":"ok"}` (still works, proving
   the refactor didn't break the Phase 1 route).
3. `curl http://localhost:4000/api/health` — expect a 200 JSON body with `status: "ok"`,
   `database: "connected"`, and `userCount` matching the number of seeded users (2, unless you've
   changed the data).
4. Temporarily stop your local PostgreSQL server, then repeat step 3 — expect a `500` response
   shaped `{"error":{"message":"Internal server error"}}`, and a stack trace printed in the
   server's terminal (from `console.error(err)` inside `errorHandler`). Restart PostgreSQL
   afterward.
5. Request a nonexistent route, e.g. `curl -i http://localhost:4000/api/nope` — expect Express's
   default 404 HTML response (no custom 404 handler has been added yet; this is expected at this
   phase since only `AppError`s thrown from inside routes are formatted by `errorHandler` — a
   truly unmatched route never reaches any handler that throws one).

**Failure indicators:**
- `Cannot find module '../config/env'` → folder/file typo; re-check paths under `src/config/`.
- `TypeError: schema.parse is not a function` — only relevant once Phase 4 starts using
  `validate`; not exercised in this phase's own tests.
- `ZodError` import fails → `zod` wasn't installed; run the install command above.

## Common Failure Points

- Forgetting to register `errorHandler` **after** `app.use('/api', routes)` — Express error
  middleware must be added last, or it will never be reached for errors thrown in routes
  registered after it.
- `asyncHandler`'s generic type: if a controller isn't declared `async`, wrapping it in
  `asyncHandler` still works but provides no benefit — always mark controller functions `async`
  when they call awaited service functions.
- Confusing where cross-cutting concerns belong: middleware (`middlewares/`) is for
  request/response pipeline concerns (auth checks, validation, error formatting); services
  (`services/`) are for business logic and database access; controllers (`controllers/`) are
  strictly thin glue and should not contain Prisma calls directly.

## Common Mistakes

- Putting `prisma.user.count()` directly inside `health.controller.ts` instead of
  `health.service.ts` — this defeats the purpose of the layered architecture (services should
  own all Prisma access so controllers stay swappable/testable).
- Throwing a raw `Error` instead of an `AppError` when you want a specific status code — a plain
  `throw new Error('not found')` will be caught by `errorHandler`'s generic branch and always
  return 500, not 404.
- Not exporting `router` as default from each `*.routes.ts` file, breaking the `import ... from`
  statements in `routes/index.ts`.

## Checkpoint

**What now works:**
- The full layered folder structure (`routes/controllers/services/middlewares/schemas/utils/types`)
  exists and is proven end-to-end by one real endpoint.
- `GET /api/health` genuinely queries PostgreSQL through Prisma and reports connectivity.
- Errors thrown anywhere in the request-handling chain are caught by one central
  `errorHandler` and formatted consistently per the spec's error shape.
- `asyncHandler` means no controller needs a manual `try/catch` for promise rejections.

**What you should understand before continuing:**
- The direction of the call chain: routes → (middlewares) → controllers → services → Prisma, and
  why each layer's responsibility is scoped the way it is.
- How `AppError` + `errorHandler` produce the spec's exact error JSON shape
  (`{ error: { message, code?, details? } }`).
- Why `validate.middleware.ts` exists now even though it isn't wired to a real route until
  Phase 4.

## Preparation for the Next Phase

Phase 4 adds real authentication: `schemas/auth.schema.ts` (Zod), `utils/hash.ts` (bcrypt),
`utils/jwt.ts` (JWT signing/verification), `middlewares/authenticate.middleware.ts`,
`services/auth.service.ts`, `controllers/auth.controller.ts`, and `routes/auth.routes.ts`,
mounted into `routes/index.ts` alongside the existing health route. Before starting Phase 4:
- Keep the current folder structure and files exactly as they are — Phase 4 only adds new files
  and adds one new `router.use(...)` line to `routes/index.ts`.
- No client changes are needed to start Phase 4.
