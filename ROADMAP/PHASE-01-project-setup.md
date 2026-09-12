# Phase 1 — Project Setup & Tooling

## Goal

Scaffold the monorepo exactly as defined in the architecture spec: an npm-workspaces repo with
a `server/` (Express + TypeScript) and a `client/` (Vite + React + TypeScript + Tailwind)
package, each independently runnable, with a root `package.json` that can start both at once.
By the end of this phase, `npm run dev` from the repo root serves:

- `GET http://localhost:4000/` → `{"message": "ok"}`
- `http://localhost:5173/` → a page that renders the text "Job Application Tracker"

No real business logic exists yet — this phase is pure tooling and scaffolding.

## Prerequisites

- Node.js 20 LTS or newer installed (`node -v`).
- npm 10+ (ships with Node 20).
- Git installed, and the repository already initialized (per the overview, the repo currently
  contains only `subject.md` and the `ROADMAP/` folder).
- A code editor. No database is required yet — PostgreSQL is introduced in Phase 2.

## What's intentionally deferred

- No Prisma, no database connection, no `.env` values that matter yet (only placeholders).
- No real Express routes beyond a single hello-world route — no layered architecture yet
  (routes/controllers/services folders arrive in Phase 3).
- No React Router, Redux, or TanStack Query in the client — those are Phase 8+ (owned by the
  frontend track). The client is intentionally just a Vite scaffold with Tailwind wired up and
  one placeholder page.
- No authentication, no forms, no real UI components.
- No testing setup yet (Phase 7 for backend, Phase 13 for frontend).

## Concepts learned

- npm workspaces: managing two independent packages (`server`, `client`) from one root
  `package.json` with shared tooling and a single `npm install`.
- TypeScript project configuration for a Node backend vs. a Vite/React frontend (different
  `tsconfig.json` targets/module settings).
- Running a TypeScript Express server in development without a manual compile step, using
  `tsx watch`.
- Vite's dev server and build pipeline for React + TypeScript.
- Wiring Tailwind CSS into a Vite project (PostCSS config, content globs, `@tailwind`
  directives).
- Running two dev servers concurrently from one root command.

## Complete project directory structure (end of Phase 1)

```
job_application_tracker/
├── package.json
├── .gitignore
├── README.md
├── subject.md
├── ROADMAP/
│   ├── 00-OVERVIEW.md
│   ├── PHASE-01-project-setup.md
│   ├── PHASE-02-database-prisma.md
│   ├── PHASE-03-express-architecture.md
│   ├── PHASE-04-authentication.md
│   ├── PHASE-05-applications-crud.md
│   ├── PHASE-06-filtering-pagination-stats.md
│   └── PHASE-07-backend-testing.md
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   ├── .env
│   └── src/
│       ├── app.ts
│       └── server.ts
└── client/
    ├── package.json
    ├── tsconfig.json
    ├── tsconfig.node.json
    ├── vite.config.ts
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── index.html
    ├── .env.example
    ├── .env
    └── src/
        ├── main.tsx
        ├── App.tsx
        └── index.css
```

## Step-by-step implementation

### 1. Create the root package.json (npm workspaces)

From the repository root:

```bash
npm init -y
```

Then replace the generated `package.json` with the exact content below.

### 2. Create the root `.gitignore`

### 3. Scaffold the client with Vite

```bash
npm create vite@latest client -- --template react-ts
```

This creates `client/` with a default React + TS template. We will overwrite several of its
generated files below to match the spec exactly (Tailwind config, placeholder page, env file).

### 4. Scaffold the server folder by hand

```bash
mkdir server
mkdir server/src
```

(On PowerShell, `mkdir server` and `mkdir server/src` work identically; on POSIX shells use
`mkdir -p server/src`.)

### 5. Install root, server, and client dependencies

From the repository root (npm workspaces lets you target a workspace with `-w`):

```bash
npm install -D concurrently -w job_application_tracker
```

> If your npm version does not support installing a root-only devDependency via `-w` against
> the root package name, simply run `npm install -D concurrently` from the repo root — it will
> install into the root `node_modules` since the root `package.json` is not itself a named
> workspace member.

Install server dependencies:

```bash
cd server
npm install express cors cookie-parser dotenv
npm install -D typescript tsx @types/node @types/express @types/cors @types/cookie-parser
cd ..
```

Install client Tailwind dependencies (the Vite/React/TS toolchain is already installed by the
`npm create vite@latest` step):

```bash
cd client
npm install -D tailwindcss@^3.4.0 postcss autoprefixer
npx tailwindcss init -p
cd ..
```

Finally, from the repo root, run one top-level install to link the workspaces together:

```bash
npm install
```

### 6. Write server TypeScript config, `app.ts`, `server.ts`

### 7. Write server `.env.example` and `.env`

### 8. Overwrite client Tailwind/PostCSS config, `index.css`, `App.tsx`, `.env` files

### 9. Run both dev servers from the root

```bash
npm run dev
```

## Exact package installs (summary)

Root:
```bash
npm install -D concurrently
```

Server (`server/`):
```bash
npm install express cors cookie-parser dotenv
npm install -D typescript tsx @types/node @types/express @types/cors @types/cookie-parser
```

Client (`client/`), after `npm create vite@latest client -- --template react-ts`:
```bash
npm install -D tailwindcss@^3.4.0 postcss autoprefixer
```

## Full file contents

### `package.json` (repo root)

```json
{
  "name": "job-application-tracker",
  "private": true,
  "version": "1.0.0",
  "workspaces": [
    "server",
    "client"
  ],
  "scripts": {
    "dev": "concurrently -n server,client -c blue,green \"npm run dev -w server\" \"npm run dev -w client\"",
    "dev:server": "npm run dev -w server",
    "dev:client": "npm run dev -w client",
    "build": "npm run build -w server && npm run build -w client",
    "build:server": "npm run build -w server",
    "build:client": "npm run build -w client"
  },
  "devDependencies": {
    "concurrently": "^8.2.2"
  }
}
```

### `.gitignore` (repo root)

```
node_modules/
dist/
build/
.env
!.env.example
*.log
.DS_Store
coverage/
client/dist/
server/dist/
```

### `README.md` (repo root)

```markdown
# Job Application Tracker

A full-stack job application tracker built with React + TypeScript (Vite, Tailwind, Redux
Toolkit, TanStack Query) on the frontend and Express + TypeScript + Prisma + PostgreSQL on the
backend, with JWT-based authentication.

This project is built incrementally across the phase documents in `ROADMAP/`. Start at
`ROADMAP/00-OVERVIEW.md`.

## Quick start (after Phase 1)

```bash
npm install
npm run dev
```

- Backend: http://localhost:4000
- Frontend: http://localhost:5173
```

### `server/package.json`

```json
{
  "name": "server",
  "private": true,
  "version": "1.0.0",
  "type": "commonjs",
  "main": "dist/server.js",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js"
  },
  "dependencies": {
    "cookie-parser": "^1.4.6",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2"
  },
  "devDependencies": {
    "@types/cookie-parser": "^1.4.7",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/node": "^20.14.9",
    "tsx": "^4.16.2",
    "typescript": "^5.5.3"
  }
}
```

### `server/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

### `server/.env.example`

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

### `server/.env`

For Phase 1, `DATABASE_URL`/`DATABASE_URL_TEST`/JWT secrets are not used yet, but we create the
file now so `server/src/server.ts` can safely read `PORT` and `CLIENT_URL` via `dotenv`. Copy
`.env.example` to `.env` verbatim:

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

> `server/.env` is git-ignored (see root `.gitignore`); `.env.example` is committed so the
> shape of required variables is documented.

### `server/src/app.ts`

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

### `server/src/server.ts`

```typescript
import 'dotenv/config';
import app from './app';

const PORT = process.env.PORT ?? 4000;

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
```

> The `app.ts` / `server.ts` split (introduced here, unchanged in shape through every later
> phase) keeps the Express app itself importable and testable (Phase 7's Supertest suite imports
> `app` directly without binding a port) while `server.ts` is the only file responsible for
> actually starting the HTTP listener.

### `client/tailwind.config.js`

(Generated by `npx tailwindcss init -p`, then edit the `content` array.)

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

### `client/postcss.config.js`

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

### `client/src/index.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### `client/src/App.tsx`

```tsx
function App() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100">
      <h1 className="text-3xl font-bold text-slate-800">Job Application Tracker</h1>
    </div>
  );
}

export default App;
```

### `client/src/main.tsx`

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

### `client/.env.example`

```
VITE_API_URL=http://localhost:4000/api
```

### `client/.env`

```
VITE_API_URL=http://localhost:4000/api
```

> Not used yet in Phase 1 (no API calls exist in the client), but created now per the spec so
> the shape is fixed from the start.

### `client/vite.config.ts`

(Generated by `npm create vite@latest`; content confirmed/kept as-is.)

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
```

### `client/index.html`

(Generated by Vite; edit only the `<title>`.)

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Job Application Tracker</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

The rest of the Vite-generated `client/` files (`tsconfig.json`, `tsconfig.node.json`,
`package.json`, `eslint` config if generated) are kept as scaffolded by
`npm create vite@latest client -- --template react-ts`, with only the `name` field of
`client/package.json` left as `"client"` and the following scripts confirmed present:

### `client/package.json` (relevant scripts, after Tailwind install)

```json
{
  "name": "client",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.39",
    "tailwindcss": "^3.4.4",
    "typescript": "^5.5.3",
    "vite": "^5.3.1"
  }
}
```

## How It Works — tracing one request

1. You run `npm run dev` from the repo root.
2. Root `package.json`'s `dev` script uses `concurrently` to run two workspace scripts at once:
   `npm run dev -w server` (which runs `tsx watch src/server.ts`) and `npm run dev -w client`
   (which runs `vite`).
3. `tsx watch src/server.ts` starts the Node process, executing `server.ts`. `import 'dotenv/config'`
   loads `server/.env` into `process.env` before anything else runs.
4. `server.ts` imports the already-configured `app` from `app.ts` and calls `app.listen(PORT, ...)`,
   binding an HTTP server on port 4000.
5. A browser or curl request to `GET http://localhost:4000/` is received by Express's internal
   router. It first passes through the `cors` middleware (checks the `Origin` header against
   `http://localhost:5173`), then `express.json()` (no-op for a bodyless GET), then
   `cookieParser()` (parses any `Cookie` header into `req.cookies`, unused here), and finally
   matches the `app.get('/', ...)` handler, which calls `res.json({ message: 'ok' })`.
6. Separately, Vite's dev server serves `client/index.html`, which loads `src/main.tsx` as an ES
   module. `main.tsx` mounts `<App />` into `#root`. `App.tsx` renders a centered heading styled
   entirely with Tailwind utility classes, which Vite's PostCSS pipeline (using
   `tailwind.config.js` + `postcss.config.js`) compiles from `src/index.css`'s `@tailwind`
   directives.

## End-to-end example

```bash
curl -i http://localhost:4000/
```

Expected response:

```
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
...

{"message":"ok"}
```

## Test This Phase

1. From the repo root: `npm install` — expect it to finish with no errors and create a single
   root `node_modules/` plus workspace-linked `node_modules/` inside `server/` and `client/`
   (npm workspaces hoists most packages to the root).
2. `npm run dev` from the repo root.
   - Expect terminal output prefixed `[server]` showing `Server listening on http://localhost:4000`.
   - Expect terminal output prefixed `[client]` showing Vite's `VITE vX.X.X ready in ... ms` and
     `Local: http://localhost:5173/`.
3. Open `http://localhost:5173/` in a browser. Expect to see "Job Application Tracker" centered
   on a light gray background, styled with a bold serif-free heading — confirms Tailwind classes
   are being compiled (if Tailwind wiring is broken, the text renders unstyled/black, left-aligned).
4. Run `curl http://localhost:4000/` (or open it in a browser). Expect exactly
   `{"message":"ok"}`.
5. Edit `client/src/App.tsx` while `npm run dev` is running (e.g. change the heading text) and
   save. Expect the browser to hot-reload instantly without a manual refresh (Vite HMR working).
6. Edit `server/src/app.ts` (e.g. change the JSON message) while running. Expect `tsx watch` to
   print a restart message and the new response to be live within ~1 second.

**Failure indicators:**
- `EADDRINUSE` on port 4000 or 5173 → something else is already bound to that port; stop it or
  change `PORT`/Vite's `server.port` temporarily.
- Blank white page at `:5173` with a console error about `App` not found → check `main.tsx`'s
  import path and that `App.tsx` has a default export.
- Unstyled plain text instead of a styled heading → Tailwind not wired: check
  `tailwind.config.js` `content` globs, `postcss.config.js`, and that `index.css` is imported in
  `main.tsx`.

## Common Failure Points

- Forgetting `cd` back to the repo root after scaffolding the client with
  `npm create vite@latest client -- --template react-ts` (which itself must be run from the
  repo root so it creates `./client`, not a nested directory).
- Running `npm install` inside `server/` or `client/` individually instead of from the root once
  workspaces are set up — this still works, but can create duplicate nested `node_modules` and
  is easy to forget for the other package; prefer root-level installs with `-w`.
- `tsx` vs `ts-node`: `ts-node` requires additional `tsconfig` flags (`ts-node` compiler options
  or `"module": "commonjs"` quirks with newer TS); `tsx` (used here) works out of the box with
  ESM/CJS interop and is the simpler, currently-recommended choice for a dev-time TS runner.
- CORS misconfiguration: forgetting `credentials: true` now will silently break cookie-based
  auth in Phase 4, since the browser will refuse to send/receive the `refreshToken` cookie
  without it.

## Common Mistakes

- Committing `.env` (real secrets) instead of only `.env.example` — verify `.gitignore` excludes
  `.env` at both the root and is respected inside `server/`/`client/` (a single root
  `.gitignore` with `.env` covers all nested `.env` files as long as there's no override).
- Using `require`/CommonJS syntax in `client/` files — the client is ESM (`"type": "module"` in
  `client/package.json`); use `import`/`export` everywhere.
- Adding real routes/business logic into `app.ts` beyond the hello-world route — resist this
  urge; the layered structure (routes/controllers/services) is deliberately introduced in
  Phase 3 so this phase stays purely about tooling.

## Checkpoint

**What now works:**
- `npm run dev` from the repo root starts both the Express server (port 4000) and the Vite dev
  server (port 5173) concurrently.
- `GET /` on the backend returns `{"message": "ok"}`.
- The frontend renders a Tailwind-styled placeholder page.
- The monorepo's npm-workspaces structure is in place for all future phases to build on.

**What you should understand before continuing:**
- Why `app.ts` and `server.ts` are separate files (testability — Phase 7 will import `app`
  without starting a listener).
- How npm workspaces resolve dependencies (hoisting to the root `node_modules`, `-w` flag to
  target a specific workspace).
- How Vite's dev server and Tailwind's PostCSS pipeline fit together.

## Preparation for the Next Phase

Phase 2 introduces PostgreSQL and Prisma into `server/`. Before starting Phase 2:
- Make sure a local PostgreSQL server is installed and running (or you have access to one), and
  that you can create a database named `job_tracker` (and later `job_tracker_test`).
- Keep `server/.env` as created in this phase — Phase 2 will start actually using
  `DATABASE_URL`.
- No client changes are needed to start Phase 2.
