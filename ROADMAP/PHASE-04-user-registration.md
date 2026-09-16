# Phase 04 — User Registration

> **As built (review 2026-09-16):** you replaced Step 7's `defineProperty` approach with
> `req.validated` + `validated(schema, req)` (overview D16), and your schemas no longer
> declare `query`/`params`. Both are sound. Step 8 (malformed JSON → 400) was **not yet
> applied** at review time. Tables were also renamed via `@@map` (overview D17).

**Goal:** `POST /api/auth/register` safely creates a user with a bcrypt-hashed password
and returns clean 201 / 400 / 409 responses.

**What becomes possible:** before this phase nobody could create an account, and the
existing `validate()` middleware crashed on any valid request. After it, accounts can be
created through the API, bad input is rejected with useful messages, and passwords are
never stored or returned in readable form.

---

## Prerequisites

- Phases 01–03 done (they are — see `00-OVERVIEW.md` §2).
- PostgreSQL running. From `server/`:

  ```bash
  npx prisma migrate status
  ```

  Expected last line: `Database schema is up to date!`
- A static check passes before you change anything:

  ```bash
  npx tsc --noEmit
  ```

  Expected: no output, prompt returns (exit code 0).
- You are on branch `auth` (`git branch --show-current` prints `auth`).
- Run the `curl` commands in this phase in a **Git Bash** terminal (VS Code terminal
  dropdown → Git Bash). In Windows PowerShell 5.1, `curl` is a different program.

Files you already have and will reuse unchanged: `src/utils/hash.ts` (exports `hash`,
`comparePassword`), `src/utils/AppError.ts`, `src/utils/asyncHandler.ts`,
`src/config/prisma.ts`.

---

## Deliberately deferred

| Not in this phase | Where |
| --- | --- |
| Login, access tokens, `authenticate` middleware, `GET /auth/me` (and your existing `utils/jwt.ts` and `types/express.d.ts`) | Phase 05 |
| Refresh cookie, logout, token revocation (`tokenVersion`) | Phase 06 |
| Rate limiting sign-up/login attempts | Phase 07 |
| Automated tests for everything verified manually here | Phase 08 |
| Registration also returning a token (so sign-up logs you in) | Phase 05 |

No packages to install — `bcrypt` and `zod` are already in `package.json`.

---

## Concept 1 — Validation at the boundary (and why your middleware breaks)

**The problem.** Anything can arrive in a request body: a missing field, `"email": 42`,
`"  Alice@Example.COM "`, a 5 MB name, or a sneaky extra `"passwordHash": "..."`.
The React form (Phase 15) will validate too, but anyone can call the API with curl.
**The server must never trust its input.**

**What solves it.** A Zod schema describes the only acceptable shape. `safeParse` returns
either the cleaned data or a list of issues. Three properties matter here:

1. **Transform, then check** — `.trim().toLowerCase()` runs before `.pipe(z.email())`, so
   emails are stored in one canonical form.
2. **Unknown keys are stripped** — `z.object` drops fields you did not declare, so a client
   cannot smuggle `passwordHash` or `id` into `prisma.user.create`.
3. **Replace the request data with the parsed result** — later code sees only cleaned values.

Tiny example:

```ts
const email = z.string().trim().toLowerCase().pipe(z.email());
email.parse('  Alice@Example.COM ');   // 'alice@example.com'
email.safeParse('nope').success;       // false
```

**Why your middleware breaks.** Step 3 is where the existing `validate()` fails. In
**Express 5**, `req.query` is a *getter* defined on the request prototype, with no setter.
In an ES module (always strict mode), assigning to a getter-only property throws. Your
auth schemas contain `query: z.object({}).optional()`, so `parsed.query` is `{}` (truthy),
and the line `req.query = parsed.query` runs → `TypeError` → 500 on **every valid
request**. You will reproduce this in Step 6 before fixing it.

**Cost.** Schemas are extra code that must stay in sync with the database. That is why
the TypeScript input type is *derived* from the schema (`z.infer`) instead of written twice.

## Concept 2 — Password hashing in the sign-up flow

**The problem.** If the `User` table ever leaks (backup, SQL injection, a misconfigured
admin tool), plaintext passwords would compromise users on every site where they reused them.

**What solves it.** Store a **slow, salted, one-way hash**. Your `hash()` calls
`bcrypt.hash(password, 10)`, which produces something like:

```text
$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy
 │   │  └ first 22 chars: random salt, remaining 31: the hash (no spaces in real hashes)
 │   └ cost: 2^10 rounds (~50–100 ms per hash, deliberately slow)
 └ algorithm version
```

- **Salt:** the same password produces a different hash every time, so precomputed tables are useless.
- **Cost:** slow for attackers trying billions of guesses; barely noticeable for one sign-up.
- **One-way:** at login (Phase 05), `comparePassword` re-hashes the attempt with the stored salt and compares.

**The 72-byte trap.** bcrypt only uses the first **72 bytes**. Longer passwords are silently
truncated: two passwords sharing the first 72 bytes would both work. We reject them in
validation instead. We count *bytes*, not characters: one emoji is 4 bytes in UTF-8.

**Why now.** This is the first moment a password enters the system.

**Cost.** About 70 ms of CPU per sign-up/login. That is fine here, but it is also why login
needs rate limiting (Phase 07): each attempt costs the server real work.

### Supporting idea — the database constraint is the source of truth

The obvious approach is "`findUnique` by email → if found, 409 → else `create`". Two requests
arriving at the same moment can both pass the check, and one then crashes on the unique
index as an unhandled 500. Instead we just `create`, and translate Prisma error **`P2002`**
(unique constraint violation) into a 409. There is one query and no race. (Verified: with
`@prisma/adapter-pg`, PostgreSQL error `23505` is mapped to `P2002`.)

---

## Implementation

Run everything from `server/` unless stated otherwise. Start the dev server in its own
terminal and leave it running; `tsx watch` restarts on every save:

```bash
cd server
npm run dev
```

Expected: `Server listening on http://localhost:4000`

### Step 1 — Replace `server/src/schemas/auth.schema.ts`

This fixes P3 (email normalisation, deprecated `z.string().email()`, 72-byte limit) and
adds a `name` length cap.

```ts
import { z } from 'zod';

// bcrypt only uses the first 72 BYTES of a password and silently ignores the rest.
const MAX_PASSWORD_BYTES = 72;

// Normalise first, then validate: "  Alice@Example.com " and "alice@example.com"
// must be treated as the same account.
const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Must be a valid email address'));

const passwordBytesLimit = (value: string) =>
  Buffer.byteLength(value, 'utf8') <= MAX_PASSWORD_BYTES;

export const registerSchema = z.object({
  body: z.object({
    email: emailField,
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .refine(passwordBytesLimit, 'Password must be at most 72 bytes'),
    name: z
      .string()
      .trim()
      .min(1, 'Name is required')
      .max(100, 'Name must be at most 100 characters'),
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

export const loginSchema = z.object({
  body: z.object({
    email: emailField,
    password: z
      .string()
      .min(1, 'Password is required')
      .refine(passwordBytesLimit, 'Password must be at most 72 bytes'),
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>['body'];
export type LoginInput = z.infer<typeof loginSchema>['body'];
```

> Why `.pipe(z.email())` and not `z.email().trim().toLowerCase()`? In Zod 4 the email format
> check runs on the raw string, so `"  Alice@Example.COM "` would be rejected *before* it
> is trimmed. (Verified against the installed Zod 4.6.5.)

`loginSchema` is not used until Phase 05; it is updated now so both schemas normalise
email identically.

### Step 2 — Create `server/src/services/auth.service.ts`

The service owns the business rules: hash, insert, translate the duplicate error. It
knows nothing about HTTP (`req`/`res`).

```ts
import { Prisma } from '@prisma/client';
import prisma from '../config/prisma.js';
import type { RegisterInput } from '../schemas/auth.schema.js';
import { AppError } from '../utils/AppError.js';
import { hash } from '../utils/hash.js';

// The only User columns allowed to leave the server. passwordHash is never selected,
// so it cannot leak into a response by accident.
export const publicUserSelect = {
  id: true,
  email: true,
  name: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;

export async function registerUser(input: RegisterInput): Promise<PublicUser> {
  const passwordHash = await hash(input.password);

  try {
    return await prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash,
      },
      select: publicUserSelect,
    });
  } catch (err) {
    // P2002 = unique constraint violation on User.email. The database constraint is the
    // source of truth: two simultaneous sign-ups with the same email cannot both succeed.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw AppError.conflict('An account with this email already exists', 'EMAIL_TAKEN');
    }
    throw err;
  }
}
```

Notes:
- `return await` (not just `return`) is required: without `await`, the rejection would escape the `try/catch`.
- `satisfies Prisma.UserSelect` type-checks the object but keeps its literal type, so `PublicUser` is exactly `{ id; email; name; createdAt }`. Phase 05 reuses `publicUserSelect` for login and `/me`.

### Step 3 — Create `server/src/controllers/auth.controller.ts`

The controller is thin HTTP glue: read the request, call the service, send the response.

```ts
import type { Request, Response } from 'express';
import type { RegisterInput } from '../schemas/auth.schema.js';
import { registerUser } from '../services/auth.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const register = asyncHandler(async (req: Request, res: Response) => {
  // validate(registerSchema) already ran, so req.body is the parsed, normalised input.
  const user = await registerUser(req.body as RegisterInput);

  res.status(201).json({ user });
});
```

### Step 4 — Create `server/src/routes/auth.routes.ts`

```ts
import { Router } from 'express';
import { register } from '../controllers/auth.controller.js';
import { validate } from '../middlewares/validate.middleware.js';
import { registerSchema } from '../schemas/auth.schema.js';

const router = Router();

// Mounted under /auth in routes/index.ts, so this is POST /api/auth/register.
router.post('/register', validate(registerSchema), register);

export default router;
```

### Step 5 — Mount the auth router in `server/src/routes/index.ts`

Before:

```ts
import { Router } from 'express';
import healthRoutes from './health.routes.js';

const router = Router();

router.use(healthRoutes);

export default router;
```

After:

```ts
import { Router } from 'express';
import healthRoutes from './health.routes.js';
import authRoutes from './auth.routes.js';

const router = Router();

router.use(healthRoutes);
router.use('/auth', authRoutes);

export default router;
```

Mounting with a prefix (`'/auth'`) keeps every auth path in one place. Phases 05–06 add
`/login`, `/refresh`, `/logout`, `/me` to the same router.

### Step 6 — Run it and observe the Express 5 bug

Save all files; `tsx watch` restarts. In Git Bash:

```bash
curl -i -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"Password123!","name":"Alice"}'
```

**Expected (this is the bug, not success):**

```text
HTTP/1.1 500 Internal Server Error
...
{"error":{"message":"Internal server error"}}
```

and in the `npm run dev` terminal:

```text
TypeError: Cannot set property query of #<IncomingMessage> which has only a getter
    at ... validate.middleware.ts ...
```

Validation *succeeded*; the crash happens when the middleware writes the result back. No
user was created, because the controller never ran.

### Step 7 — Replace `server/src/middlewares/validate.middleware.ts`

Two changes: `safeParse` instead of `try/catch` around `parse` (simpler control flow), and
`Object.defineProperty` for `query`.

```ts
import type { NextFunction, Request, Response } from 'express';
import type { ZodObject } from 'zod';

// Validates { body, query, params } against a Zod schema, then replaces them with the
// parsed values (trimmed, lower-cased, unknown keys stripped).
export function validate<T extends ZodObject>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    if (!result.success) {
      // errorHandler turns a ZodError into a 400 VALIDATION_ERROR response.
      return next(result.error);
    }

    const parsed = result.data as {
      body?: unknown;
      query?: Request['query'];
      params?: Request['params'];
    };

    if (parsed.body !== undefined) req.body = parsed.body;
    if (parsed.params !== undefined) req.params = parsed.params;

    if (parsed.query !== undefined) {
      // Express 5 defines req.query as a getter with no setter, so `req.query = x` throws.
      // defineProperty places a plain value on this request object that hides the getter.
      Object.defineProperty(req, 'query', {
        value: parsed.query,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }

    next();
  };
}
```

How it works: property lookup checks the object itself before its prototype. The getter
lives on the prototype; `defineProperty` creates an *own* property on this one `req`, which
is found first. `req.params` and `req.body` are ordinary own properties, so plain
assignment is fine for them. This matters again in Phase 11, where the parsed query
contains coerced numbers (`page: 2`, not `"2"`).

Repeat the Step 6 curl. **Expected now:**

```text
HTTP/1.1 201 Created
...
{"user":{"id":"<uuid>","email":"alice@example.com","name":"Alice","createdAt":"2026-09-...Z"}}
```

> If you get **409** instead, an `alice@example.com` user already existed in your database.
> Change the email in the command (e.g. `alice2@example.com`) and use it for the rest of
> this phase.

### Step 8 — Observe and fix the malformed-JSON 500

Send broken JSON (note the trailing comma, missing closing brace):

```bash
curl -i -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"bob@example.com","password":"Password123!",'
```

**Expected (bug):** `500 {"error":{"message":"Internal server error"}}`, and the dev terminal
prints a `SyntaxError` whose `body:` field contains the raw text **including the password**.

That is two problems: a client mistake reported as a server failure, and a secret written
to logs. Replace `server/src/middlewares/error.middleware.ts`:

```ts
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/AppError.js';

// express.json() rejects invalid JSON with a SyntaxError tagged type 'entity.parse.failed'.
function isMalformedJsonError(err: unknown): boolean {
  return err instanceof SyntaxError && 'type' in err && err.type === 'entity.parse.failed';
}

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

  // Answer before console.error: this error object contains the raw request body,
  // which may include a password.
  if (isMalformedJsonError(err)) {
    return res.status(400).json({
      error: {
        message: 'Malformed JSON body',
        code: 'INVALID_JSON',
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

Repeat the broken-JSON curl. **Expected:**

```text
HTTP/1.1 400 Bad Request
...
{"error":{"message":"Malformed JSON body","code":"INVALID_JSON"}}
```

and **nothing** printed in the dev terminal.

> Zod 4 issues do not include the rejected input value by default, so `VALIDATION_ERROR`
> responses never echo a password back either (you will see this in check 4 below).

---

## Resulting tree (server/src)

```text
server/src/
├── app.ts
├── server.ts
├── config/
│   ├── env.ts
│   └── prisma.ts
├── controllers/
│   ├── auth.controller.ts        ← new
│   └── health.controller.ts
├── middlewares/
│   ├── error.middleware.ts       ← changed (malformed JSON → 400)
│   └── validate.middleware.ts    ← changed (Express 5 fix)
├── routes/
│   ├── auth.routes.ts            ← new
│   ├── health.routes.ts
│   └── index.ts                  ← changed (mount /auth)
├── schemas/
│   ├── .gitkeep
│   └── auth.schema.ts            ← changed (normalisation, limits)
├── services/
│   ├── auth.service.ts           ← new
│   └── health.service.ts
├── types/
│   ├── .gitkeep
│   └── express.d.ts              (untouched; used in Phase 05)
└── utils/
    ├── AppError.ts
    ├── asyncHandler.ts
    ├── hash.ts
    └── jwt.ts                    (untouched; used in Phase 05)
```

---

## Verification

Keep `npm run dev` running. Run each check in Git Bash from any directory.

### 0. Static check

```bash
cd server && npx tsc --noEmit
```

Expected: no output. Any output is a type error to fix before continuing.

### 1. Success (already done in Step 7)

`201` with `{"user":{"id","email","name","createdAt"}}` — confirm there is **no**
`passwordHash` key in the response.

### 2. Duplicate email → 409

```bash
curl -i -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"Password123!","name":"Alice Again"}'
```

Expected:

```text
HTTP/1.1 409 Conflict
{"error":{"message":"An account with this email already exists","code":"EMAIL_TAKEN"}}
```

### 3. Same email, different case and spaces → still 409 (normalisation works)

```bash
curl -i -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"  ALICE@Example.COM ","password":"Password123!","name":"Alice"}'
```

Expected: the same `409 EMAIL_TAKEN`.

### 4. Invalid input → 400 with field details

```bash
curl -i -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"not-an-email","password":"short","name":"Alice"}'
```

Expected (the `pattern` value is long; the rest should match):

```text
HTTP/1.1 400 Bad Request
{"error":{"message":"Validation failed","code":"VALIDATION_ERROR","details":[
  {"origin":"string","code":"invalid_format","format":"email","pattern":"...","path":["body","email"],"message":"Must be a valid email address"},
  {"origin":"string","code":"too_small","minimum":8,"inclusive":true,"path":["body","password"],"message":"Password must be at least 8 characters"}
]}}
```

Note that `"short"` (the password) appears nowhere in the response.

### 5. Password over 72 bytes → 400

```bash
LONG=$(printf 'a%.0s' $(seq 1 73)); echo ${#LONG}
curl -i -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"long@example.com\",\"password\":\"$LONG\",\"name\":\"Long\"}"
```

Expected: `73` printed first, then

```text
HTTP/1.1 400 Bad Request
{"error":{"message":"Validation failed","code":"VALIDATION_ERROR","details":[{"code":"custom","path":["body","password"],"message":"Password must be at most 72 bytes"}]}}
```

### 6. Missing body / missing Content-Type → 400

```bash
curl -i -X POST http://localhost:4000/api/auth/register
```

Expected: `400` with `details` containing
`"path":["body"],"message":"Invalid input: expected object, received undefined"`.

### 7. Mass-assignment attempt is ignored

```bash
curl -i -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"bob@example.com","password":"Password123!","name":"Bob","passwordHash":"hacked","id":"00000000-0000-0000-0000-000000000000"}'
```

Expected: `201`, and the returned `id` is a random UUID, **not** all zeros.

### 8. Look at what is actually stored

In a second terminal, from `server/`:

```bash
npx prisma studio
```

Open the URL it prints, then open the `User` model. Expected:
- `alice@example.com` and `bob@example.com` rows, emails lower-case.
- `passwordHash` values starting with `$2b$10$`, 60 characters long, different for the two users even though both passwords were `Password123!`.
- Bob's `passwordHash` is **not** `hacked`.

Stop Studio with `Ctrl+C` when done.

### 9. Malformed JSON → 400 (done in Step 8), dev terminal silent.

### Automated tests

Behavioural tests need the test database and Supertest, which arrive in **Phase 08**. Each
of checks 1–7 above becomes a test case there, so keep this list. For this phase the
automated check is `npx tsc --noEmit`.

---

## Likely errors

| Symptom | Cause | Fix |
| --- | --- | --- |
| Dev terminal: `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../services/auth.service'` | Relative import missing the `.js` extension (ESM + `nodenext` requires it, even for `.ts` files). | Write `'../services/auth.service.js'`, exactly as in the code above. |
| `500` and the dev terminal still shows `Cannot set property query ... only a getter` | The Step 7 file was not saved, or you edited a different file. | Replace the whole `validate.middleware.ts` with Step 7's content and save. |
| `404` with an HTML body `Cannot POST /api/auth/register` | Router not mounted, or mounted without the `'/auth'` prefix, or the route written as `'/auth/register'` *and* mounted under `'/auth'` (→ `/api/auth/auth/register`). | Match Steps 4 and 5 exactly. |
| `500`; dev terminal shows `PrismaClientKnownRequestError ... code: 'ECONNREFUSED'` | PostgreSQL is not running or `DATABASE_URL` is wrong. | Start PostgreSQL; `npx prisma migrate status` must succeed. |
| `400 ... "path":["body"] ... received undefined` even though you sent JSON | The `Content-Type: application/json` header is missing (common in PowerShell). | Use Git Bash and include `-H "Content-Type: application/json"`. |

---

## Commits

From the repository root, in three small logical commits (the bug fixes are independent of
the feature and should be reviewable alone):

```bash
git add server/src/middlewares/validate.middleware.ts
git commit -m "Fix validate middleware for Express 5 read-only req.query"

git add server/src/middlewares/error.middleware.ts
git commit -m "Return 400 for malformed JSON bodies without logging them"

git add server/src/schemas/auth.schema.ts server/src/services/auth.service.ts server/src/controllers/auth.controller.ts server/src/routes/auth.routes.ts server/src/routes/index.ts
git commit -m "Add user registration endpoint"
```

`server/src/types/express.d.ts` stays untracked until Phase 05, where it is used. Commit the
roadmap separately:

```bash
git add -A ROADMAP
git commit -m "Replace roadmap with plan based on current repository state"
```

Self-review before committing: `git diff --staged` — no `console.log` debugging lines, no
`passwordHash` in any response path.

---

## Definition of done

- [ ] `npx tsc --noEmit` prints nothing.
- [ ] Step 6's 500 was observed and understood (getter on the prototype, own property via `defineProperty`).
- [ ] Register returns `201` with `id, email, name, createdAt` and no `passwordHash`.
- [ ] Duplicate email returns `409 EMAIL_TAKEN`, including with different case or spaces.
- [ ] Invalid input, >72-byte password and missing body each return `400 VALIDATION_ERROR`.
- [ ] Malformed JSON returns `400 INVALID_JSON` and logs nothing.
- [ ] Extra fields (`passwordHash`, `id`) are ignored.
- [ ] Prisma Studio shows lower-case emails and distinct `$2b$10$…` hashes.
- [ ] You can explain: why the backend validates even if the frontend does; why hashes are salted and slow; why `P2002` beats check-then-insert.
- [ ] Three commits made (plus the roadmap commit).

---

**Next — Phase 05:** users exist but cannot prove who they are on later requests, so we
add login with a JWT access token and an `authenticate` middleware that turns
`Authorization: Bearer …` into a trusted `req.user`.
