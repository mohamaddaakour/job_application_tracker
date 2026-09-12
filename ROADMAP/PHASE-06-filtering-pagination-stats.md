# Phase 6 — Filtering, Pagination & Stats

## Goal

Extend `GET /api/applications` with server-side search (`?search=`), status filtering
(`?status=`), and pagination (`?page=&limit=`), changing its response shape to the spec's exact
paginated envelope. Add `GET /api/applications/stats` returning total and per-status counts. By
the end of this phase, both endpoints match the spec's response shapes exactly.

## Prerequisites

- Phase 5 complete: full CRUD working, ownership enforcement verified.
- Enough test data to exercise filtering/pagination meaningfully (the Phase 2 seed data — 6
  applications across 5 statuses for 2 users — is sufficient for manual testing; consider
  creating a few more via `POST /api/applications` if you want to see multiple pages with a
  small `limit`).

## What's intentionally deferred

- No automated test suite yet — Phase 7 covers this with Vitest + Supertest, including tests for
  the filtering/pagination/stats behavior introduced here.
- No frontend UI for filters/pagination — that's Phase 12 (owned by the frontend track); this
  phase is backend query-parameter handling only.

## Concepts learned

- Building a dynamic Prisma `where` clause that combines a case-insensitive `OR` search across
  multiple text fields with an `AND`-ed exact-match filter.
- Prisma's `contains` + `mode: 'insensitive'` for case-insensitive substring search on
  PostgreSQL.
- Pagination with Prisma's `skip`/`take`, combined with a `count` query to compute `total` and
  `totalPages`.
- Aggregating counts per enum value with Prisma (`groupBy`, or parallel `count` calls) to build a
  stats payload.
- Validating and defaulting query-string parameters with Zod (`page`/`limit` as coerced,
  bounded numbers).

## Complete project directory structure (end of Phase 6)

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
│       │   ├── health.routes.ts
│       │   ├── auth.routes.ts
│       │   └── application.routes.ts
│       ├── controllers/
│       │   ├── health.controller.ts
│       │   ├── auth.controller.ts
│       │   └── application.controller.ts
│       ├── services/
│       │   ├── health.service.ts
│       │   ├── auth.service.ts
│       │   └── application.service.ts
│       ├── middlewares/
│       │   ├── error.middleware.ts
│       │   ├── validate.middleware.ts
│       │   └── authenticate.middleware.ts
│       ├── schemas/
│       │   ├── auth.schema.ts
│       │   └── application.schema.ts
│       ├── utils/
│       │   ├── AppError.ts
│       │   ├── asyncHandler.ts
│       │   ├── hash.ts
│       │   └── jwt.ts
│       └── types/
│           └── express.d.ts
└── client/
    └── ... (unchanged)
```

No new files or folders are introduced in this phase — only modifications to
`schemas/application.schema.ts`, `services/application.service.ts`,
`controllers/application.controller.ts`, and `routes/application.routes.ts`.

## Step-by-step implementation

### 1. Add a `listApplicationsQuerySchema` to `schemas/application.schema.ts`

### 2. Rewrite `listApplications` in `services/application.service.ts` to accept filter/pagination
   params and return the paginated envelope

### 3. Add `getApplicationStats` to `services/application.service.ts`

### 4. Update `list` in `controllers/application.controller.ts` to pass query params through, and
   add a `stats` controller

### 5. Add the `GET /applications/stats` route in `application.routes.ts` — **must be registered
   before** `GET /applications/:id`, otherwise Express would match `/applications/stats` as
   `:id = "stats"`

No new npm packages are required.

## Exact package installs (summary)

None — Phase 6 introduces no new dependencies.

## Full file contents

### `server/src/schemas/application.schema.ts` (updated — full file)

```typescript
import { z } from 'zod';

const statusEnum = z.enum(['APPLIED', 'INTERVIEW', 'REJECTED', 'OFFER', 'ACCEPTED']);

export const createApplicationSchema = z.object({
  body: z.object({
    company: z.string().min(1, 'Company is required'),
    position: z.string().min(1, 'Position is required'),
    location: z.string().optional(),
    jobUrl: z.string().url('jobUrl must be a valid URL').optional(),
    status: statusEnum.optional(),
    appliedAt: z.coerce.date({ errorMap: () => ({ message: 'appliedAt must be a valid date' }) }),
    notes: z.string().optional(),
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

export const updateApplicationSchema = z.object({
  body: z
    .object({
      company: z.string().min(1).optional(),
      position: z.string().min(1).optional(),
      location: z.string().nullable().optional(),
      jobUrl: z.string().url().nullable().optional(),
      status: statusEnum.optional(),
      appliedAt: z.coerce.date().optional(),
      notes: z.string().nullable().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field must be provided to update',
    }),
  query: z.object({}).optional(),
  params: z.object({
    id: z.string().uuid('Invalid application id'),
  }),
});

export const applicationIdParamSchema = z.object({
  body: z.object({}).optional(),
  query: z.object({}).optional(),
  params: z.object({
    id: z.string().uuid('Invalid application id'),
  }),
});

export const listApplicationsQuerySchema = z.object({
  body: z.object({}).optional(),
  query: z.object({
    search: z.string().trim().min(1).optional(),
    status: statusEnum.optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
  }),
  params: z.object({}).optional(),
});

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>['body'];
export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>['body'];
export type ListApplicationsQuery = z.infer<typeof listApplicationsQuerySchema>['query'];
```

### `server/src/services/application.service.ts` (updated — full file)

```typescript
import { Prisma } from '@prisma/client';
import prisma from '../config/prisma';
import { AppError } from '../utils/AppError';
import {
  CreateApplicationInput,
  UpdateApplicationInput,
  ListApplicationsQuery,
} from '../schemas/application.schema';

export async function createApplication(userId: string, input: CreateApplicationInput) {
  return prisma.jobApplication.create({
    data: {
      ...input,
      userId,
    },
  });
}

export interface PaginatedApplications {
  data: Awaited<ReturnType<typeof prisma.jobApplication.findMany>>;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export async function listApplications(
  userId: string,
  query: ListApplicationsQuery
): Promise<PaginatedApplications> {
  const { search, status, page, limit } = query;

  const where: Prisma.JobApplicationWhereInput = {
    userId,
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { company: { contains: search, mode: 'insensitive' } },
            { position: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [data, total] = await Promise.all([
    prisma.jobApplication.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.jobApplication.count({ where }),
  ]);

  return {
    data,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function getApplicationById(userId: string, id: string) {
  const application = await prisma.jobApplication.findFirst({
    where: { id, userId },
  });

  if (!application) {
    throw AppError.notFound('Application not found', 'APPLICATION_NOT_FOUND');
  }

  return application;
}

export async function updateApplication(
  userId: string,
  id: string,
  input: UpdateApplicationInput
) {
  await getApplicationById(userId, id);

  return prisma.jobApplication.update({
    where: { id },
    data: input,
  });
}

export async function deleteApplication(userId: string, id: string) {
  await getApplicationById(userId, id);

  await prisma.jobApplication.delete({ where: { id } });
}

export interface ApplicationStats {
  total: number;
  byStatus: Record<'APPLIED' | 'INTERVIEW' | 'REJECTED' | 'OFFER' | 'ACCEPTED', number>;
}

export async function getApplicationStats(userId: string): Promise<ApplicationStats> {
  const grouped = await prisma.jobApplication.groupBy({
    by: ['status'],
    where: { userId },
    _count: { status: true },
  });

  const byStatus: ApplicationStats['byStatus'] = {
    APPLIED: 0,
    INTERVIEW: 0,
    REJECTED: 0,
    OFFER: 0,
    ACCEPTED: 0,
  };

  let total = 0;
  for (const row of grouped) {
    byStatus[row.status] = row._count.status;
    total += row._count.status;
  }

  return { total, byStatus };
}
```

### `server/src/controllers/application.controller.ts` (updated — full file)

```typescript
import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import {
  createApplication,
  listApplications,
  getApplicationById,
  updateApplication,
  deleteApplication,
  getApplicationStats,
} from '../services/application.service';
import { ListApplicationsQuery } from '../schemas/application.schema';

export const create = asyncHandler(async (req: Request, res: Response) => {
  const application = await createApplication(req.user!.id, req.body);
  res.status(201).json(application);
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await listApplications(req.user!.id, req.query as unknown as ListApplicationsQuery);
  res.status(200).json(result);
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  const application = await getApplicationById(req.user!.id, req.params.id);
  res.status(200).json(application);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const application = await updateApplication(req.user!.id, req.params.id, req.body);
  res.status(200).json(application);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await deleteApplication(req.user!.id, req.params.id);
  res.status(204).send();
});

export const stats = asyncHandler(async (req: Request, res: Response) => {
  const result = await getApplicationStats(req.user!.id);
  res.status(200).json(result);
});
```

### `server/src/routes/application.routes.ts` (updated — full file)

```typescript
import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  createApplicationSchema,
  updateApplicationSchema,
  applicationIdParamSchema,
  listApplicationsQuerySchema,
} from '../schemas/application.schema';
import { create, list, getOne, update, remove, stats } from '../controllers/application.controller';

const router = Router();

router.use('/applications', authenticate);

router.post('/applications', validate(createApplicationSchema), create);
router.get('/applications/stats', stats);
router.get('/applications', validate(listApplicationsQuerySchema), list);
router.get('/applications/:id', validate(applicationIdParamSchema), getOne);
router.patch('/applications/:id', validate(updateApplicationSchema), update);
router.delete('/applications/:id', validate(applicationIdParamSchema), remove);

export default router;
```

> `GET /applications/stats` is registered before `GET /applications/:id` deliberately — Express
> matches routes in registration order, and `:id` would otherwise greedily match the literal
> path segment `stats`.

All other files (`app.ts`, `server.ts`, `routes/index.ts`, `auth.*`, `health.*`, `config/*`,
`middlewares/*`, `utils/*`, `types/*`) are unchanged from Phase 5.

## How It Works — tracing one request

`GET /api/applications?search=eng&status=APPLIED&page=1&limit=2` as Alice:

1. `authenticate` sets `req.user`.
2. `validate(listApplicationsQuerySchema)` parses `req.query`. `search` stays `"eng"`, `status`
   is validated against the enum, `page`/`limit` are coerced from strings to numbers (`"1"` →
   `1`, `"2"` → `2`) via `z.coerce.number()`. If `page`/`limit` were omitted, Zod's `.default(1)`
   / `.default(10)` would fill them in.
3. The `list` controller calls `listApplications(alice.id, { search: 'eng', status: 'APPLIED',
   page: 1, limit: 2 })`.
4. The service builds a Prisma `where`:
   ```
   {
     userId: alice.id,
     status: 'APPLIED',
     OR: [
       { company: { contains: 'eng', mode: 'insensitive' } },
       { position: { contains: 'eng', mode: 'insensitive' } }
     ]
   }
   ```
5. Two queries run in parallel via `Promise.all`: `findMany` with `skip: 0, take: 2` (page 1,
   limit 2) and `count` with the same `where` (no `skip`/`take`) to get the true total matching
   row count regardless of pagination.
6. The service computes `totalPages = Math.ceil(total / limit)` (with a floor of 1 so an empty
   result set still reports `totalPages: 1` rather than `0`, avoiding a confusing "page 1 of 0"
   UI state on the frontend) and returns `{ data, page, limit, total, totalPages }` — exactly
   the spec's shape.
7. The controller responds 200 with that object directly as the JSON body.

For `GET /api/applications/stats` as Alice:

1. `authenticate` runs, then `stats` controller calls `getApplicationStats(alice.id)`.
2. The service runs `prisma.jobApplication.groupBy({ by: ['status'], where: { userId },
   _count: { status: true } })`, producing one row per status value **that has at least one
   matching application** (statuses with zero rows for this user are omitted by `groupBy`).
3. The service starts a `byStatus` object pre-filled with all five statuses at `0`, then
   overwrites each with the actual count from the grouped result, and sums all counts into
   `total` — this guarantees the response always includes all five status keys, matching the
   spec's exact example shape, even for statuses with no applications.

## End-to-end example

```bash
curl -s "http://localhost:4000/api/applications?status=APPLIED&page=1&limit=10" \
  -H "Authorization: Bearer $ALICE_TOKEN"
```

Expected response (200), assuming Alice has one `APPLIED` application from the Phase 2 seed
data plus any created in Phase 5's testing:

```json
{
  "data": [
    {
      "id": "…",
      "company": "Acme Corp",
      "position": "Frontend Engineer",
      "location": "Remote",
      "jobUrl": "https://acme.example.com/jobs/1",
      "status": "APPLIED",
      "appliedAt": "2026-…",
      "notes": "Applied via referral.",
      "userId": "…alice's id…",
      "createdAt": "…",
      "updatedAt": "…"
    }
  ],
  "page": 1,
  "limit": 10,
  "total": 1,
  "totalPages": 1
}
```

```bash
curl -s http://localhost:4000/api/applications/stats -H "Authorization: Bearer $ALICE_TOKEN"
```

Expected response (200), matching Alice's seeded data (one row per status):

```json
{
  "total": 4,
  "byStatus": { "APPLIED": 1, "INTERVIEW": 1, "REJECTED": 1, "OFFER": 1, "ACCEPTED": 0 }
}
```

## Test This Phase

1. `GET /api/applications` with no query params — expect the paginated envelope with
   `page: 1, limit: 10` (defaults) and `data` containing up to 10 of the user's applications,
   most-recently-created first.
2. `GET /api/applications?limit=1&page=1` then `?limit=1&page=2` — expect different single-item
   `data` arrays (assuming the user has 2+ applications) and consistent `total`/`totalPages`
   across both calls.
3. `GET /api/applications?status=REJECTED` — expect only `REJECTED` rows in `data`, and `total`
   reflecting only that count.
4. `GET /api/applications?search=acme` (or any substring of a seeded company name, in mixed
   case, e.g. `AcMe`) — expect a case-insensitive match to succeed.
5. `GET /api/applications?page=999` (beyond the last page) — expect `200` with `data: []` and
   the same `total`/`totalPages` as an unfiltered query (not an error).
6. `GET /api/applications?limit=0` or `?page=0` — expect `400 VALIDATION_ERROR` (Zod's `.min(1)`
   rejects these).
7. `GET /api/applications/stats` — expect all five status keys present even if some are `0`, and
   `total` equal to the sum of all `byStatus` values, and equal to the user's total row count via
   a separate unpaginated `GET /api/applications?limit=100` comparison.
8. Confirm `GET /api/applications/stats` only counts the authenticated user's own rows by
   comparing Alice's and Bob's stats — they must differ according to their respective seed data.

**Failure indicators:**
- `/applications/stats` returns a 400 `Invalid application id` error → the `:id` route matched
  before `/applications/stats`; check route registration order in `application.routes.ts`.
- Search matches are case-sensitive → confirm `mode: 'insensitive'` is present (this option only
  works on Prisma's PostgreSQL connector, which this project uses).
- `totalPages` is `0` for an empty result → the `Math.max(1, ...)` floor is missing.

## Common Failure Points

- Route order: Express matches path patterns top-to-bottom; `/applications/stats` must be
  registered before `/applications/:id`, or `:id` will capture `"stats"` as if it were an id,
  producing a Zod UUID validation error instead of reaching the stats handler.
- Building the `where` clause with unconditional keys set to `undefined` instead of
  conditionally spreading them in — Prisma treats an explicit `status: undefined` the same as
  "not filtered" in most versions, but the conditional-spread pattern used here
  (`...(status ? { status } : {})`) is clearer and avoids relying on that behavior.
- Forgetting the `count` query must use the **same** `where` clause as the `findMany` query, or
  `total`/`totalPages` will be inconsistent with the actual filtered results.

## Common Mistakes

- Applying `skip`/`take` to the `count` query by mistake, which would make `total` reflect only
  the current page's size instead of the true total matching count.
- Using `findMany` with `distinct` or manual grouping in JS instead of `groupBy` for stats —
  `groupBy` pushes the aggregation to PostgreSQL, which is both simpler and more efficient than
  fetching all rows and counting in application code.
- Forgetting that `groupBy` omits statuses with zero matching rows — always pre-seed the
  `byStatus` result object with all five keys at `0` before overwriting with real counts, as
  shown, to match the spec's exact response shape unconditionally.

## Checkpoint

**What now works:**
- `GET /api/applications` supports `search`, `status`, `page`, and `limit` query parameters and
  returns the exact paginated envelope shape from the spec.
- `GET /api/applications/stats` returns total and per-status counts, always including all five
  status keys.
- All filtering/pagination/stats queries remain scoped to the authenticated user only.

**What you should understand before continuing:**
- Why `count` must share the same `where` clause as the paginated `findMany`.
- Why `/applications/stats` must be registered before `/applications/:id`.
- How Zod's `z.coerce.number()` with `.default()` turns query-string values into typed,
  defaulted numbers before they ever reach the service layer.

## Preparation for the Next Phase

Phase 7 writes a full Vitest + Supertest suite covering auth (register/login/refresh/logout,
success and failure cases), applications CRUD happy paths, validation failures, and — critically
— a test proving cross-user access returns 404. It runs against a real test database via
`DATABASE_URL_TEST`. Before starting Phase 7:
- Confirm a `job_tracker_test` PostgreSQL database exists (created in Phase 2's prerequisites)
  and is reachable via the `DATABASE_URL_TEST` value already in `server/.env`.
- No client changes are needed to start Phase 7.
