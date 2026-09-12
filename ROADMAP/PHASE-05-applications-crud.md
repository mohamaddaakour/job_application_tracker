# Phase 5 — Applications CRUD

## Goal

Implement the full `JobApplication` CRUD endpoints from the spec (`POST/GET /applications`,
`GET/PATCH/DELETE /applications/:id`), protected by the `authenticate` middleware from Phase 4,
with Zod schemas for create/update, and a service layer that enforces ownership on every query
(a user can only ever see/modify their own applications; cross-user access returns 404, not
403). By the end of this phase, full CRUD works end-to-end via curl, and attempting to access
another user's application by id returns 404.

## Prerequisites

- Phase 4 complete: register/login/refresh/logout/me all working, `authenticate` middleware
  exists.
- At least two registered users available for testing ownership (e.g. seeded `alice@example.com`
  and `bob@example.com`, both password `Password123!`).

## What's intentionally deferred

- No search/status filtering or pagination yet — `GET /applications` in this phase returns all
  of the authenticated user's applications, unfiltered and unpaginated. Query-string filtering,
  pagination, and `GET /applications/stats` all arrive in Phase 6.
- No automated test suite yet (Phase 7) — this phase is verified manually via curl.

## Concepts learned

- Designing a REST resource with full CRUD semantics under an authenticated, owned-resource
  model.
- PATCH semantics for partial updates: every field in the update schema is optional, and only
  provided fields are written.
- Enforcing per-user data isolation at the service layer by including `userId` in every Prisma
  `where` clause, rather than fetching first and checking ownership in application code
  afterward (both approaches are valid; this project uses the `where`-clause approach so a
  non-owned row is indistinguishable from a non-existent one at the database level).
- Returning 404 instead of 403 for ownership violations, and why that specific choice avoids
  leaking whether a given id exists at all.
- Structuring Zod schemas for `body`/`params` together on the same route.

## Complete project directory structure (end of Phase 5)

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

## Step-by-step implementation

### 1. Create `schemas/application.schema.ts` — Zod schemas for create/update/id param

### 2. Create `services/application.service.ts` — CRUD logic, every query scoped by `userId`

### 3. Create `controllers/application.controller.ts` — thin HTTP glue

### 4. Create `routes/application.routes.ts`, protected with `authenticate`, mounted in
   `routes/index.ts`

No new npm packages are required — everything needed (Prisma, Zod, Express, the `authenticate`
middleware) already exists from prior phases.

## Exact package installs (summary)

None — Phase 5 introduces no new dependencies.

## Full file contents

### `server/src/schemas/application.schema.ts`

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

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>['body'];
export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>['body'];
```

> `status`/`appliedAt`/optional string fields deliberately use `.nullable().optional()` on
> update so a client can explicitly clear `location`/`jobUrl`/`notes` by sending `null`, while
> omitting a field entirely leaves it unchanged (true PATCH semantics). `create` requires
> `appliedAt` since the underlying Prisma field is non-nullable with no default.

### `server/src/services/application.service.ts`

```typescript
import prisma from '../config/prisma';
import { AppError } from '../utils/AppError';
import { CreateApplicationInput, UpdateApplicationInput } from '../schemas/application.schema';

export async function createApplication(userId: string, input: CreateApplicationInput) {
  return prisma.jobApplication.create({
    data: {
      ...input,
      userId,
    },
  });
}

export async function listApplications(userId: string) {
  return prisma.jobApplication.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getApplicationById(userId: string, id: string) {
  const application = await prisma.jobApplication.findFirst({
    where: { id, userId },
  });

  if (!application) {
    // Deliberately 404, not 403: this also covers "id belongs to another user" without
    // revealing whether the id exists at all.
    throw AppError.notFound('Application not found', 'APPLICATION_NOT_FOUND');
  }

  return application;
}

export async function updateApplication(
  userId: string,
  id: string,
  input: UpdateApplicationInput
) {
  // Confirm ownership first (throws 404 if not owned/found), then update by primary key.
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
```

### `server/src/controllers/application.controller.ts`

```typescript
import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import {
  createApplication,
  listApplications,
  getApplicationById,
  updateApplication,
  deleteApplication,
} from '../services/application.service';

export const create = asyncHandler(async (req: Request, res: Response) => {
  const application = await createApplication(req.user!.id, req.body);
  res.status(201).json(application);
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const applications = await listApplications(req.user!.id);
  res.status(200).json(applications);
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
```

> Note: `list` in this phase returns a bare array. Phase 6 changes this endpoint's response
> shape to the paginated envelope (`{ data, page, limit, total, totalPages }`) specified in the
> spec — that change is called out explicitly in Phase 6 as a modification to this same file.

### `server/src/routes/application.routes.ts`

```typescript
import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  createApplicationSchema,
  updateApplicationSchema,
  applicationIdParamSchema,
} from '../schemas/application.schema';
import { create, list, getOne, update, remove } from '../controllers/application.controller';

const router = Router();

router.use('/applications', authenticate);

router.post('/applications', validate(createApplicationSchema), create);
router.get('/applications', list);
router.get('/applications/:id', validate(applicationIdParamSchema), getOne);
router.patch('/applications/:id', validate(updateApplicationSchema), update);
router.delete('/applications/:id', validate(applicationIdParamSchema), remove);

export default router;
```

> `router.use('/applications', authenticate)` applies the `authenticate` middleware to every
> route defined below it on this router, since they all share the `/applications` prefix.

### `server/src/routes/index.ts` (updated)

```typescript
import { Router } from 'express';
import healthRoutes from './health.routes';
import authRoutes from './auth.routes';
import applicationRoutes from './application.routes';

const router = Router();

router.use(healthRoutes);
router.use(authRoutes);
router.use(applicationRoutes);

export default router;
```

All other files (`app.ts`, `server.ts`, `auth.*`, `health.*`, `config/*`, `middlewares/*` other
than the routes index, `utils/*`, `types/*`) are unchanged from Phase 4.

## How It Works — tracing one request

`POST /api/applications` with header `Authorization: Bearer <alice's access token>` and body
`{"company":"Stark Industries","position":"SRE","appliedAt":"2026-01-01"}`:

1. `/api` → `routes/index.ts` → `applicationRoutes`. The request matches
   `router.post('/applications', validate(createApplicationSchema), create)`, but first passes
   through `router.use('/applications', authenticate)` since that middleware was registered
   first on this router for the shared `/applications` prefix.
2. `authenticate` verifies the Bearer token, sets `req.user = { id: alice.id, email:
   alice.email }`, calls `next()`.
3. `validate(createApplicationSchema)` parses `req.body`. `company`/`position` are present;
   `appliedAt` is coerced from the string `"2026-01-01"` into a `Date` via `z.coerce.date()`.
   `status` is omitted, so it stays `undefined` in the parsed body (Prisma will apply its schema
   default of `APPLIED` when the field is omitted from `data`).
4. The `create` controller calls `createApplication(req.user!.id, req.body)`.
5. The service calls `prisma.jobApplication.create({ data: { ...input, userId } })`, inserting a
   new row with `userId` set to Alice's id — the client never supplies `userId` directly; it is
   always taken from the authenticated request, which is what makes ownership trustworthy.
6. The controller responds `201` with the full created row as JSON, including the
   database-generated `id`, `createdAt`, `updatedAt`, and the default `status: "APPLIED"`.

For an ownership violation — Bob's access token requesting Alice's application id via
`GET /api/applications/:id`:

1. `authenticate` sets `req.user = { id: bob.id, ... }`.
2. `validate(applicationIdParamSchema)` confirms `:id` is a syntactically valid UUID.
3. `getOne` calls `getApplicationById(bob.id, aliceApplicationId)`.
4. The service runs `prisma.jobApplication.findFirst({ where: { id: aliceApplicationId, userId:
   bob.id } })`. Because the `where` clause requires both conditions simultaneously, Prisma finds
   no matching row (the row exists, but not under `bob.id`) and returns `null`.
5. The service throws `AppError.notFound(...)`; `errorHandler` responds
   `404 {"error":{"message":"Application not found","code":"APPLICATION_NOT_FOUND"}}` — from
   Bob's perspective, indistinguishable from requesting a truly nonexistent id.

## End-to-end example

Assuming `$ALICE_TOKEN` holds a valid access token for `alice@example.com` (obtained via
`POST /api/auth/login`):

```bash
curl -s -X POST http://localhost:4000/api/applications \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"company":"Stark Industries","position":"SRE","location":"Remote","appliedAt":"2026-01-01"}'
```

Expected response (201):

```json
{
  "id": "3f1a2b4c-…",
  "company": "Stark Industries",
  "position": "SRE",
  "location": "Remote",
  "jobUrl": null,
  "status": "APPLIED",
  "appliedAt": "2026-01-01T00:00:00.000Z",
  "notes": null,
  "userId": "…alice's id…",
  "createdAt": "2026-09-12T…",
  "updatedAt": "2026-09-12T…"
}
```

List Alice's applications:

```bash
curl -s http://localhost:4000/api/applications -H "Authorization: Bearer $ALICE_TOKEN"
```

Expected: a JSON array containing the row just created plus any other applications belonging to
Alice (e.g. the seeded ones from Phase 2, if that seed data is still present).

Update (PATCH, partial):

```bash
curl -s -X PATCH http://localhost:4000/api/applications/3f1a2b4c-... \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"INTERVIEW"}'
```

Expected: 200, full updated row with `status: "INTERVIEW"` and an updated `updatedAt`, all other
fields unchanged.

Delete:

```bash
curl -i -X DELETE http://localhost:4000/api/applications/3f1a2b4c-... \
  -H "Authorization: Bearer $ALICE_TOKEN"
```

Expected: `204 No Content`, empty body.

## Test This Phase

1. Log in as Alice and Bob separately, saving each access token.
2. Create an application as Alice — expect 201 with `userId` matching Alice's id.
3. `GET /api/applications` as Alice — expect the new application in the array.
4. `GET /api/applications` as Bob — expect Alice's new application NOT present (only Bob's own
   rows).
5. `GET /api/applications/:id` as Bob using Alice's application id — expect `404
   {"error":{"message":"Application not found","code":"APPLICATION_NOT_FOUND"}}`.
6. `PATCH /api/applications/:id` as Bob using Alice's application id — expect the same 404 (the
   ownership check runs before the update in `updateApplication`).
7. `DELETE /api/applications/:id` as Bob using Alice's application id — expect the same 404, and
   confirm via a subsequent `GET` as Alice that the row still exists (wasn't deleted).
8. `POST /api/applications` with a missing required field (e.g. no `company`) — expect `400`
   with `code: "VALIDATION_ERROR"`.
9. `PATCH /api/applications/:id` with an empty body `{}` — expect `400` (the `.refine` check
   requires at least one field).
10. Any applications route with no `Authorization` header — expect `401`.

**Failure indicators:**
- Getting `403` instead of `404` on ownership tests → check that `getApplicationById` uses
  `findFirst` with both `id` and `userId` in one `where`, not a separate ownership check after a
  plain `findUnique`.
- `Invalid application id` validation error on a real id → the `:id` route param schema expects
  a UUID; Prisma's `@default(uuid())` ids will always match this, but double-check for typos.
- `appliedAt` rejected — check the request sends an ISO-8601-parseable date string.

## Common Failure Points

- Using `prisma.jobApplication.findUnique({ where: { id } })` instead of `findFirst({ where: {
  id, userId } })` for ownership-sensitive reads — `findUnique` only accepts unique fields
  (here, just `id`), so it cannot express the "AND owned by this user" condition in one query,
  which would force an unsafe two-step check (fetch, then compare `userId` in JS) that's easy to
  get wrong under refactors. `findFirst` with a compound `where` keeps the check atomic and
  consistent everywhere.
- Trusting a `userId` field from the request body during `create` — always take `userId` only
  from `req.user!.id` (set exclusively by `authenticate` from the verified JWT), never from
  client-supplied input.
- Forgetting `router.use('/applications', authenticate)` applies only to routes defined *after*
  it on the same router instance — order matters.

## Common Mistakes

- Returning `200` instead of `201` from `create`, or a body from `delete` (spec-consistent REST
  conventions: `201` + created resource for POST, `204` + empty body for DELETE).
- Allowing `PATCH` to silently accept unknown/extra fields — Zod's default is to strip unknown
  keys on `.object()` schemas (not `.strict()`), which is intentional and convenient here, but
  worth knowing: it silently drops unrecognized fields rather than rejecting them.
- Not distinguishing "not found" from "found but not yours" internally even though both return
  the same 404 externally — the code path is identical by design (a single `findFirst` with a
  compound `where`), so there is nothing extra to implement, but it's a common point of
  confusion when first reasoning about the security property.

## Checkpoint

**What now works:**
- Full CRUD on `/api/applications`, protected by authentication.
- Cross-user access to another user's application id is blocked and returns 404.
- PATCH updates support true partial-field semantics.

**What you should understand before continuing:**
- Why the ownership check is expressed as a compound Prisma `where` clause rather than a
  post-fetch comparison.
- Why 404 (not 403) is returned for ownership violations, and what information that withholds
  from an attacker.
- That `list` currently returns a bare array — Phase 6 will change its response shape to the
  spec's paginated envelope; this is a known, intentional modification coming next, not a bug.

## Preparation for the Next Phase

Phase 6 adds `?search=&status=&page=&limit=` query support to `GET /applications` (changing its
response shape to `{ data, page, limit, total, totalPages }`) and introduces
`GET /applications/stats`. Before starting Phase 6:
- Make sure you have enough seeded/created test data across multiple statuses and company names
  to meaningfully exercise search and pagination (the Phase 2 seed data already spans all five
  statuses).
- No client changes are needed to start Phase 6.
