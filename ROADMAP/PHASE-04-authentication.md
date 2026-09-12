# Phase 4 — Authentication

## Goal

Implement real authentication exactly as decided in the spec's "Auth design decisions": register,
login, refresh, logout, and "me" endpoints, bcrypt password hashing, JWT access + refresh
tokens, an `authenticate` middleware, and Zod validation schemas for register/login. By the end
of this phase, a user can register, log in, call a protected route, refresh their access token,
and log out — all verifiable via curl.

## Prerequisites

- Phase 3 complete: layered architecture in place, `GET /api/health` working.
- `job_tracker` database migrated and seeded (Phase 2).

## What's intentionally deferred

- No `JobApplication` endpoints yet (Phase 5) — this phase only proves the auth flow itself, so
  the only "protected route" demonstrated is `GET /api/auth/me`.
- No server-side refresh-token table/revocation list. This is a deliberate, permanent
  simplification (not deferred to a later phase — it is a named limitation of the whole
  project): the spec's auth design explicitly rejects a refresh-token table to keep the
  database small, per the subject's instruction. Consequences: a stolen refresh token remains
  valid until it expires (7 days) or its secret is rotated; there is no way to force-logout a
  single session server-side. This is documented as an assumption/limitation, consistent with
  the overview's decision table.
- No rate limiting on auth routes yet (`express-rate-limit` arrives in Phase 14, which owns all
  hardening concerns).

## Concepts learned

- Password hashing with bcrypt (10 salt rounds) — never storing or comparing plaintext
  passwords.
- JWT access tokens (short-lived, 15m, returned in the JSON response body, held only in memory
  on the client — never persisted here since the client isn't built until Phase 8+) vs. refresh
  tokens (longer-lived, 7d, delivered as an `httpOnly` cookie so client-side JavaScript can never
  read it).
- Why access tokens go in the response body but refresh tokens go in a cookie: it's a deliberate
  split of trust — the access token is short-lived enough that XSS exposure risk is low and it
  needs to be attached to `Authorization` headers by client code, while the refresh token must
  never be readable by JavaScript at all (mitigating XSS token theft) and is automatically
  resent by the browser via the cookie mechanism.
- Express middleware for authentication: extracting and verifying a Bearer token, attaching
  `req.user`, and rejecting unauthenticated requests with 401 before they reach a controller.
- Zod schema validation wired through the generic `validate(schema)` middleware from Phase 3.
- Cookie configuration flags: `httpOnly`, `sameSite`, `secure` (environment-conditional).

## Complete project directory structure (end of Phase 4)

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
│       │   └── auth.routes.ts
│       ├── controllers/
│       │   ├── health.controller.ts
│       │   └── auth.controller.ts
│       ├── services/
│       │   ├── health.service.ts
│       │   └── auth.service.ts
│       ├── middlewares/
│       │   ├── error.middleware.ts
│       │   ├── validate.middleware.ts
│       │   └── authenticate.middleware.ts
│       ├── schemas/
│       │   └── auth.schema.ts
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

### 1. Install jsonwebtoken

```bash
cd server
npm install jsonwebtoken
npm install -D @types/jsonwebtoken
cd ..
```

(`bcrypt` and `zod` are already installed from Phases 2 and 3.)

### 2. Create `utils/hash.ts` — the real password-hashing utility

This is the utility referenced in Phase 2's seed script comment as "arriving in Phase 4."

### 3. Create `utils/jwt.ts` — sign/verify helpers for access and refresh tokens

### 4. Create `types/express.d.ts` — augment Express's `Request` type with `req.user`

### 5. Create `schemas/auth.schema.ts` — Zod schemas for register and login

### 6. Create `middlewares/authenticate.middleware.ts`

### 7. Create `services/auth.service.ts` — register/login/refresh/logout/me business logic

### 8. Create `controllers/auth.controller.ts` — thin HTTP glue

### 9. Create `routes/auth.routes.ts` and mount it in `routes/index.ts`

### 10. Update `app.ts` if needed (no change required — routes are combined in `routes/index.ts`)

## Exact package installs (summary)

```bash
cd server
npm install jsonwebtoken
npm install -D @types/jsonwebtoken
cd ..
```

## Full file contents

### `server/src/utils/hash.ts`

```typescript
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

### `server/src/utils/jwt.ts`

```typescript
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface AccessTokenPayload {
  id: string;
  email: string;
}

export interface RefreshTokenPayload {
  id: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_EXPIRES_IN,
  });
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.REFRESH_TOKEN_EXPIRES_IN,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
}
```

### `server/src/types/express.d.ts`

```typescript
// Augments Express's Request type so `req.user` is recognized throughout the app after the
// `authenticate` middleware attaches it.
export {};

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
      };
    }
  }
}
```

### `server/src/schemas/auth.schema.ts`

```typescript
import { z } from 'zod';

export const registerSchema = z.object({
  body: z.object({
    email: z.string().email('Must be a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    name: z.string().min(1, 'Name is required'),
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Must be a valid email address'),
    password: z.string().min(1, 'Password is required'),
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>['body'];
export type LoginInput = z.infer<typeof loginSchema>['body'];
```

### `server/src/middlewares/authenticate.middleware.ts`

```typescript
import { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError';
import { verifyAccessToken } from '../utils/jwt';

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(AppError.unauthorized('Missing or malformed Authorization header', 'NO_TOKEN'));
  }

  const token = authHeader.slice('Bearer '.length);

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.id, email: payload.email };
    next();
  } catch {
    next(AppError.unauthorized('Invalid or expired access token', 'INVALID_TOKEN'));
  }
}
```

### `server/src/services/auth.service.ts`

```typescript
import prisma from '../config/prisma';
import { AppError } from '../utils/AppError';
import { hashPassword, comparePassword } from '../utils/hash';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../utils/jwt';
import { RegisterInput, LoginInput } from '../schemas/auth.schema';

export interface AuthResult {
  user: { id: string; email: string; name: string };
  accessToken: string;
  refreshToken: string;
}

export async function registerUser(input: RegisterInput): Promise<AuthResult> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw AppError.conflict('An account with this email already exists', 'EMAIL_TAKEN');
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      name: input.name,
    },
  });

  const accessToken = signAccessToken({ id: user.id, email: user.email });
  const refreshToken = signRefreshToken({ id: user.id });

  return {
    user: { id: user.id, email: user.email, name: user.name },
    accessToken,
    refreshToken,
  };
}

export async function loginUser(input: LoginInput): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    throw AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  const passwordMatches = await comparePassword(input.password, user.passwordHash);
  if (!passwordMatches) {
    throw AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  const accessToken = signAccessToken({ id: user.id, email: user.email });
  const refreshToken = signRefreshToken({ id: user.id });

  return {
    user: { id: user.id, email: user.email, name: user.name },
    accessToken,
    refreshToken,
  };
}

export async function refreshAccessToken(
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string }> {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw AppError.unauthorized('Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.id } });
  if (!user) {
    throw AppError.unauthorized('Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN');
  }

  const accessToken = signAccessToken({ id: user.id, email: user.email });
  // Issue a new refresh token too (rotation on use), signed the same way; since there is no
  // server-side refresh-token table (see spec/limitations), rotation here is best-effort and
  // does not invalidate the previous refresh token server-side.
  const newRefreshToken = signRefreshToken({ id: user.id });

  return { accessToken, refreshToken: newRefreshToken };
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw AppError.unauthorized('User no longer exists', 'USER_NOT_FOUND');
  }
  return { id: user.id, email: user.email, name: user.name };
}
```

### `server/src/controllers/auth.controller.ts`

```typescript
import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import {
  registerUser,
  loginUser,
  refreshAccessToken,
  getMe,
} from '../services/auth.service';
import { env } from '../config/env';

const REFRESH_COOKIE_NAME = 'refreshToken';

const refreshCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.NODE_ENV === 'production',
  path: '/api/auth',
};

export const register = asyncHandler(async (req: Request, res: Response) => {
  const result = await registerUser(req.body);
  res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, refreshCookieOptions);
  res.status(201).json({ user: result.user, accessToken: result.accessToken });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const result = await loginUser(req.body);
  res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, refreshCookieOptions);
  res.status(200).json({ user: result.user, accessToken: result.accessToken });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!token) {
    throw AppError.unauthorized('No refresh token provided', 'NO_REFRESH_TOKEN');
  }
  const result = await refreshAccessToken(token);
  res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, refreshCookieOptions);
  res.status(200).json({ accessToken: result.accessToken });
});

export const logout = asyncHandler(async (_req: Request, res: Response) => {
  res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions);
  res.status(200).json({ message: 'Logged out' });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const user = await getMe(req.user!.id);
  res.status(200).json({ user });
});
```

> `refreshCookieOptions.path` is scoped to `/api/auth` so the browser only sends the
> `refreshToken` cookie on auth-related requests (register/login/refresh/logout), not on every
> request to the API — a small defense-in-depth measure.

### `server/src/routes/auth.routes.ts`

```typescript
import { Router } from 'express';
import { register, login, refresh, logout, me } from '../controllers/auth.controller';
import { validate } from '../middlewares/validate.middleware';
import { authenticate } from '../middlewares/authenticate.middleware';
import { registerSchema, loginSchema } from '../schemas/auth.schema';

const router = Router();

router.post('/auth/register', validate(registerSchema), register);
router.post('/auth/login', validate(loginSchema), login);
router.post('/auth/refresh', refresh);
router.post('/auth/logout', logout);
router.get('/auth/me', authenticate, me);

export default router;
```

### `server/src/routes/index.ts` (updated)

```typescript
import { Router } from 'express';
import healthRoutes from './health.routes';
import authRoutes from './auth.routes';

const router = Router();

router.use(healthRoutes);
router.use(authRoutes);

export default router;
```

### `server/src/routes/health.routes.ts` (unchanged from Phase 3)

```typescript
import { Router } from 'express';
import { getHealth } from '../controllers/health.controller';

const router = Router();

router.get('/health', getHealth);

export default router;
```

### `server/src/app.ts` (unchanged from Phase 3)

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

app.use(errorHandler);

export default app;
```

### `server/package.json` (updated — adds `jsonwebtoken`)

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
    "prisma": "^5.19.0",
    "tsx": "^4.16.2",
    "typescript": "^5.5.3"
  }
}
```

## How It Works — tracing one request

`POST /api/auth/login` with body `{"email":"alice@example.com","password":"Password123!"}`:

1. Express matches `router.post('/auth/login', validate(loginSchema), login)` inside
   `auth.routes.ts` (reached via `/api` → `routes/index.ts` → `authRoutes`).
2. `validate(loginSchema)` runs first: it calls `loginSchema.parse({ body: req.body, query:
   req.query, params: req.params })`. Since `req.body` has a valid `email`/`password` shape, Zod
   parsing succeeds; `req.body` is reassigned to the parsed value and `next()` is called.
3. The `login` controller runs, calling `loginUser(req.body)` from `auth.service.ts`.
4. `loginUser` queries `prisma.user.findUnique({ where: { email } })`, finds Alice's seeded row,
   then calls `comparePassword('Password123!', user.passwordHash)`, which runs
   `bcrypt.compare` and resolves `true` since that's the seeded plaintext password.
5. `loginUser` signs an access token (`signAccessToken`, 15m expiry, `JWT_ACCESS_SECRET`) and a
   refresh token (`signRefreshToken`, 7d expiry, `JWT_REFRESH_SECRET`), returning both plus the
   safe user fields (no `passwordHash`).
6. Back in the controller, `res.cookie('refreshToken', result.refreshToken, {...})` sets an
   `httpOnly`, `sameSite=lax` cookie scoped to path `/api/auth` (and `secure: true` only in
   production, since local HTTP dev has no TLS). The response body is
   `{ user: {...}, accessToken: "..." }` with status 200.
7. If the password were wrong, `loginUser` would `throw AppError.unauthorized(...)`; since the
   controller is wrapped in `asyncHandler`, that rejection is forwarded to `errorHandler`, which
   (since it's an `AppError`) responds `401 { "error": { "message": "Invalid email or password",
   "code": "INVALID_CREDENTIALS" } }`.

For a subsequent protected request, `GET /api/auth/me` with header
`Authorization: Bearer <accessToken>`:

1. `authenticate` middleware runs before the `me` controller. It reads the `Authorization`
   header, strips the `Bearer ` prefix, and calls `verifyAccessToken(token)`.
2. If valid, `jwt.verify` returns the decoded payload (`{ id, email, iat, exp }`); `req.user` is
   set to `{ id, email }` and `next()` is called.
3. The `me` controller calls `getMe(req.user!.id)`, which re-fetches the user from the database
   (proving the user still exists) and returns safe fields.
4. If the token is missing, malformed, or expired, `authenticate` calls
   `next(AppError.unauthorized(...))` before the controller ever runs, and `errorHandler`
   responds 401 without touching the database.

## End-to-end example

Register:

```bash
curl -i -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"email":"carol@example.com","password":"Password123!","name":"Carol Lee"}'
```

Expected response (201):

```json
{
  "user": { "id": "…uuid…", "email": "carol@example.com", "name": "Carol Lee" },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

`cookies.txt` now contains an `httpOnly` `refreshToken` cookie.

Call the protected `me` endpoint using the returned access token:

```bash
curl -i http://localhost:4000/api/auth/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

Expected response (200):

```json
{ "user": { "id": "…uuid…", "email": "carol@example.com", "name": "Carol Lee" } }
```

Refresh (using the cookie jar saved earlier):

```bash
curl -i -X POST http://localhost:4000/api/auth/refresh -b cookies.txt -c cookies.txt
```

Expected response (200): `{"accessToken":"<new token>"}`, and a new `Set-Cookie` header rotating
the refresh token.

Logout:

```bash
curl -i -X POST http://localhost:4000/api/auth/logout -b cookies.txt
```

Expected response (200): `{"message":"Logged out"}`, with a `Set-Cookie` header clearing
`refreshToken`.

## Test This Phase

1. Register a new user via curl (as above) — expect 201, a JSON body with `user` + `accessToken`,
   and a `Set-Cookie: refreshToken=...; HttpOnly; ...` header.
2. Register the same email again — expect `409 {"error":{"message":"An account with this email
   already exists","code":"EMAIL_TAKEN"}}`.
3. Login with the seeded `alice@example.com` / `Password123!` — expect 200 with a valid
   `accessToken`.
4. Login with a wrong password — expect `401 {"error":{"message":"Invalid email or
   password","code":"INVALID_CREDENTIALS"}}`.
5. Call `GET /api/auth/me` with no `Authorization` header — expect `401 {"error":{"message":"Missing
   or malformed Authorization header","code":"NO_TOKEN"}}`.
6. Call `GET /api/auth/me` with a valid token — expect 200 with the correct user.
7. Call `POST /api/auth/refresh` with no cookie — expect `401 {"error":{"message":"No refresh
   token provided","code":"NO_REFRESH_TOKEN"}}`.
8. Call `POST /api/auth/refresh` with a valid cookie (from a prior login/register) — expect 200
   with a new `accessToken` and a rotated `Set-Cookie`.
9. Call `POST /api/auth/logout` — expect 200 and a `Set-Cookie` header that clears the cookie
   (`Max-Age=0` or an expired date).
10. Submit `POST /api/auth/register` with an invalid email (e.g. `"not-an-email"`) — expect
    `400 {"error":{"message":"Validation failed","code":"VALIDATION_ERROR","details":[...]}}`.

**Failure indicators:**
- `jwt malformed` errors → check that the `Authorization` header is exactly
  `Bearer <token>` with one space.
- Refresh cookie never appears in `Set-Cookie` → check `cookie-parser` is registered in `app.ts`
  before routes, and that curl is using `-c`/`-b` to persist cookies across calls.
- `req.user` is `undefined` inside `me` → `authenticate` middleware isn't registered on that
  route, or is registered after the controller.

## Common Failure Points

- Forgetting `credentials: true` in the CORS config (already set since Phase 1) — without it,
  browsers (not curl) will refuse to store/send the refresh cookie cross-origin between
  `:5173` and `:4000`.
- Signing both tokens with the same secret — the spec requires two distinct secrets
  (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`) specifically so a leaked access-token secret alone
  cannot be used to mint refresh tokens.
- Storing the access token in `localStorage` on the client (a Phase 9 concern, but worth
  internalizing now) — the spec requires in-memory-only storage to reduce XSS blast radius; this
  phase's backend design (returning it in the JSON body, not a cookie) is what enables that
  choice.
- Not re-fetching the user in `getMe`/`refreshAccessToken` and instead trusting only the JWT
  payload — if a user is deleted after a token was issued, trusting the payload alone would let
  a stale token keep "working" until expiry for endpoints that don't hit the database; re-checking
  existence (as done here) closes that gap for `/me` and `/refresh`.

## Common Mistakes

- Returning the `passwordHash` field anywhere in a response — always hand-pick safe fields
  (`id`, `email`, `name`) as done in every service function above.
- Setting the refresh cookie's `path` to `/` instead of `/api/auth` — works, but sends the
  cookie on every API request unnecessarily; the spec doesn't mandate a specific path, but
  scoping it narrowly is a reasonable, stated judgment call for this project.
- Forgetting `sameSite: 'lax'` (or misconfiguring `secure: true` in local HTTP development,
  which would silently prevent the browser from ever storing the cookie) — `secure` must be
  conditional on `NODE_ENV === 'production'` as shown, since local dev runs over plain HTTP.

## Checkpoint

**What now works:**
- Full auth lifecycle: register, login, refresh, logout, and an authenticated `/me` endpoint,
  all verifiable via curl.
- `authenticate` middleware is ready to protect any future route (used immediately in Phase 5).
- Zod validation on register/login rejects malformed input with a consistent 400 error shape.

**What you should understand before continuing:**
- Why access and refresh tokens are transported differently (JSON body vs. httpOnly cookie) and
  what threat model that split addresses.
- The explicit limitation of having no server-side refresh-token revocation, and why that's an
  acceptable trade-off for this project's scope.
- How `authenticate` populates `req.user` for downstream handlers to rely on.

## Preparation for the Next Phase

Phase 5 builds the `JobApplication` CRUD endpoints, protected by the `authenticate` middleware
built here, with a service layer that filters every query by `userId` for ownership enforcement.
Before starting Phase 5:
- Keep at least one registered user's credentials handy for manual testing (e.g. the seeded
  `alice@example.com` / `Password123!`, or the `carol@example.com` account created above).
- No client changes are needed to start Phase 5.
