# Phase 8 — Frontend Foundation

## Goal

Stand up the real frontend application shell: a Vite + React + TypeScript app with Tailwind
CSS, React Router v6 wired to every route the app will ever have (as stubs), a Redux Toolkit
store holding a placeholder auth slice, a TanStack Query client provided at the root, a `Navbar`,
and a `ProtectedRoute` component. At the end of this phase `npm run dev` serves a fully navigable
app — every route renders a page, the Navbar links between them — but nothing talks to the
backend yet and nothing is actually protected.

**This phase replaces Phase 1's placeholder page.** Phase 1 only proved that a Tailwind-enabled
Vite React+TS app could boot inside the `client/` workspace and render one static page — it did
not add routing, state management, or any real project structure. Every file Phase 1 created
under `client/src/` is rewritten or replaced here. From this phase onward, `client/` follows the
directory structure fixed in the architecture spec.

## Prerequisites

- Phases 1–7 complete: the monorepo scaffold exists, and the backend (Express + Prisma +
  PostgreSQL) is fully built and independently runnable on `http://localhost:4000` with all
  `/api/*` routes from phases 4–6 in place. This phase does not call the backend yet, but Phase 9
  will immediately need it running.
- `client/` exists as an npm workspace with a bare Vite React-TS scaffold and Tailwind installed
  (from Phase 1).
- Node.js 18+ and npm installed. Familiarity with React function components and hooks.

## What's intentionally deferred

- No real authentication. `authSlice` is a placeholder with no thunks — `login`/`logout` do not
  exist yet. That is Phase 9.
- `ProtectedRoute` only reads the placeholder Redux state (`accessToken`); since nothing ever sets
  that state in this phase, it does not meaningfully protect anything yet — every protected page
  is reachable simply because `accessToken` is always `null`, which means `ProtectedRoute` will
  always redirect to `/login` once wired to check `!accessToken`. To keep the app navigable for
  manual testing in this phase, `ProtectedRoute` is wired but not yet enforced strictly (see the
  implementation below) — full enforcement plus real redirect-back-after-login behavior lands in
  Phase 9.
- No API calls, no forms, no data fetching. Pages render static placeholder headings only.
- No `axiosClient`, no `api/` request functions — that starts in Phase 9.
- No tests — Phase 13.

## Concepts learned

- Vite + React + TypeScript project conventions and `vite.config.ts`.
- Tailwind CSS utility-first styling and its `content` glob configuration.
- React Router v6: `createBrowserRouter` / `<RouterProvider>`, nested routes, `<Outlet>`.
- Redux Toolkit store setup: `configureStore`, `createSlice`, the `<Provider>` root wrapper.
- TanStack Query client setup: `QueryClient`, `QueryClientProvider`, devtools.
- Structuring a React app by feature (`features/`) vs. by layer (`components/`, `pages/`).
- Why route stubs are built before real data: it separates "can the user navigate the whole app"
  from "does the data work," which makes later phases additive instead of restructuring work.

## Complete project directory structure (end of Phase 8)

```
client/
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── index.html
├── .env
├── .env.example
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── index.css
    ├── vite-env.d.ts
    ├── api/                          (empty placeholder, populated in Phase 9)
    ├── app/
    │   ├── store.ts
    │   └── hooks.ts
    ├── components/
    │   ├── Navbar.tsx
    │   └── ProtectedRoute.tsx
    ├── features/
    │   ├── auth/
    │   │   └── authSlice.ts
    │   ├── applications/             (empty placeholder, populated in Phase 10)
    │   └── dashboard/                (empty placeholder, populated in Phase 10)
    ├── hooks/                        (empty placeholder)
    ├── pages/
    │   ├── LoginPage.tsx
    │   ├── RegisterPage.tsx
    │   ├── DashboardPage.tsx
    │   ├── ApplicationsPage.tsx
    │   ├── ApplicationFormPage.tsx
    │   └── ApplicationDetailsPage.tsx
    ├── routes/
    │   └── router.tsx
    ├── types/                        (empty placeholder)
    └── lib/
        └── queryClient.ts
```

## Implementation steps

### 1. Re-scaffold the client workspace cleanly

Phase 1 already ran `npm create vite@latest client -- --template react-ts` and installed
Tailwind. We keep `package.json`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.js`,
`postcss.config.js`, and `index.html` from that scaffold (shown below in their final form for
this phase — Tailwind's config is unchanged from Phase 1). We replace everything under `src/`.

From the repository root:

```bash
cd client
npm install react-router-dom@6 @reduxjs/toolkit@2 react-redux@9 @tanstack/react-query@5 @tanstack/react-query-devtools@5
```

### 2. Configure environment variables

Create `client/.env` (and keep `.env.example` in sync) with the API base URL from the spec. It is
unused by any code until Phase 9, but we fix it now so it is never revisited.

### 3. Write the Tailwind entry stylesheet, store, query client, Redux hooks, `authSlice`

### 4. Write stub pages, `Navbar`, `ProtectedRoute`

### 5. Write the router and wire `App.tsx` / `main.tsx`

### 6. Run the app and confirm every route navigates

```bash
npm run dev
```

Visit `http://localhost:5173` and click through the Navbar links.

## Exact package installs

Run inside `client/`:

```bash
npm install react-router-dom@6 @reduxjs/toolkit@2 react-redux@9 @tanstack/react-query@5 @tanstack/react-query-devtools@5
```

(`react`, `react-dom`, `typescript`, `vite`, `@vitejs/plugin-react`, `tailwindcss`, `postcss`,
`autoprefixer` are already present from Phase 1 and are not reinstalled.)

## Complete file contents

### `client/package.json`

```json
{
  "name": "client",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview"
  },
  "dependencies": {
    "@reduxjs/toolkit": "^2.2.7",
    "@tanstack/react-query": "^5.59.0",
    "@tanstack/react-query-devtools": "^5.59.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-redux": "^9.1.2",
    "react-router-dom": "^6.26.2"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.13",
    "typescript": "^5.5.4",
    "vite": "^5.4.6"
  }
}
```

### `client/vite.config.ts`

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
```

### `client/tsconfig.json`

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

### `client/tsconfig.app.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

### `client/tsconfig.node.json`

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

### `client/tailwind.config.js`

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

### `client/postcss.config.js`

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

### `client/index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Job Application Tracker</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### `client/.env`

```
VITE_API_URL=http://localhost:4000/api
```

### `client/.env.example`

```
VITE_API_URL=http://localhost:4000/api
```

### `client/src/index.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #root {
  height: 100%;
}

body {
  @apply bg-gray-50 text-gray-900;
}
```

### `client/src/vite-env.d.ts`

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

### `client/src/lib/queryClient.ts`

```ts
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});
```

### `client/src/features/auth/authSlice.ts`

```ts
import { createSlice } from "@reduxjs/toolkit";

/**
 * Placeholder auth slice for Phase 8.
 *
 * This is intentionally minimal: no async thunks, no login/logout/refresh logic.
 * Per the architecture spec, Redux owns ONLY auth state — { user, accessToken, status } —
 * and nothing else (server data belongs to TanStack Query, filters belong to the URL).
 *
 * Phase 9 replaces this file with the real slice: register/login/logout/refresh-on-load
 * thunks, and reducers that actually set `user` and `accessToken`.
 */

export type AuthStatus = "idle" | "loading" | "authenticated" | "error";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  status: AuthStatus;
}

const initialState: AuthState = {
  user: null,
  accessToken: null,
  status: "idle",
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {},
});

export default authSlice.reducer;
```

### `client/src/app/store.ts`

```ts
import { configureStore } from "@reduxjs/toolkit";
import authReducer from "../features/auth/authSlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
```

### `client/src/app/hooks.ts`

```ts
import { useDispatch, useSelector } from "react-redux";
import type { TypedUseSelectorHook } from "react-redux";
import type { RootState, AppDispatch } from "./store";

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
```

### `client/src/components/Navbar.tsx`

```tsx
import { Link } from "react-router-dom";

/**
 * Static navigation shell. Links are always visible in Phase 8 since there is no
 * real auth state to branch on yet. Phase 9 makes this conditional (Login/Register
 * links when logged out, user name + a working Logout button when logged in).
 */
export default function Navbar() {
  return (
    <nav className="flex items-center justify-between bg-white px-6 py-4 shadow-sm">
      <Link to="/" className="text-lg font-semibold text-gray-900">
        Job Application Tracker
      </Link>
      <div className="flex items-center gap-4 text-sm font-medium text-gray-600">
        <Link to="/" className="hover:text-gray-900">
          Dashboard
        </Link>
        <Link to="/applications" className="hover:text-gray-900">
          Applications
        </Link>
        <Link to="/login" className="hover:text-gray-900">
          Login
        </Link>
        <Link to="/register" className="hover:text-gray-900">
          Register
        </Link>
      </div>
    </nav>
  );
}
```

### `client/src/components/ProtectedRoute.tsx`

```tsx
import { Navigate, Outlet } from "react-router-dom";
import { useAppSelector } from "../app/hooks";

/**
 * Phase 8 note: this component reads `accessToken` from the placeholder authSlice,
 * which never gets set to anything but `null` in this phase (there is no login logic
 * yet). That means, strictly applied, this component would redirect every protected
 * route to /login and the app would be unnavigable for manual testing.
 *
 * To keep Phase 8 genuinely runnable end-to-end while still establishing the real
 * shape this component will have, it currently allows navigation through by treating
 * "no token yet" as "not enforced yet" rather than "redirect." Phase 9 replaces the
 * body of this component with the real, strictly-enforced check
 * (`if (!accessToken) return <Navigate to="/login" replace />;`) once login actually
 * populates `accessToken`.
 */
export default function ProtectedRoute() {
  const status = useAppSelector((state) => state.auth.status);

  // Phase 8: status is always "idle" because nothing sets it yet. Once Phase 9 wires
  // real auth, "idle"/"loading" will show a splash screen and "error" will redirect.
  if (status === "error") {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
```

### `client/src/pages/LoginPage.tsx`

```tsx
export default function LoginPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-2xl font-bold text-gray-900">Login</h1>
      <p className="mt-2 text-sm text-gray-500">
        The login form will be built in Phase 9.
      </p>
    </div>
  );
}
```

### `client/src/pages/RegisterPage.tsx`

```tsx
export default function RegisterPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-2xl font-bold text-gray-900">Register</h1>
      <p className="mt-2 text-sm text-gray-500">
        The registration form will be built in Phase 9.
      </p>
    </div>
  );
}
```

### `client/src/pages/DashboardPage.tsx`

```tsx
export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
      <p className="mt-2 text-sm text-gray-500">
        Stats and recent applications will be built in Phase 10.
      </p>
    </div>
  );
}
```

### `client/src/pages/ApplicationsPage.tsx`

```tsx
export default function ApplicationsPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <h1 className="text-2xl font-bold text-gray-900">Applications</h1>
      <p className="mt-2 text-sm text-gray-500">
        The application list will be built in Phase 10; filters and pagination
        arrive in Phase 12.
      </p>
    </div>
  );
}
```

### `client/src/pages/ApplicationFormPage.tsx`

```tsx
export default function ApplicationFormPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-2xl font-bold text-gray-900">Application Form</h1>
      <p className="mt-2 text-sm text-gray-500">
        The create/edit form will be built in Phase 11.
      </p>
    </div>
  );
}
```

### `client/src/pages/ApplicationDetailsPage.tsx`

```tsx
export default function ApplicationDetailsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-2xl font-bold text-gray-900">Application Details</h1>
      <p className="mt-2 text-sm text-gray-500">
        Application details will be built in Phase 11.
      </p>
    </div>
  );
}
```

### `client/src/routes/router.tsx`

```tsx
import { createBrowserRouter } from "react-router-dom";
import App from "../App";
import ProtectedRoute from "../components/ProtectedRoute";
import LoginPage from "../pages/LoginPage";
import RegisterPage from "../pages/RegisterPage";
import DashboardPage from "../pages/DashboardPage";
import ApplicationsPage from "../pages/ApplicationsPage";
import ApplicationFormPage from "../pages/ApplicationFormPage";
import ApplicationDetailsPage from "../pages/ApplicationDetailsPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { path: "login", element: <LoginPage /> },
      { path: "register", element: <RegisterPage /> },
      {
        element: <ProtectedRoute />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: "applications", element: <ApplicationsPage /> },
          { path: "applications/new", element: <ApplicationFormPage /> },
          { path: "applications/:id", element: <ApplicationDetailsPage /> },
          { path: "applications/:id/edit", element: <ApplicationFormPage /> },
        ],
      },
    ],
  },
]);
```

### `client/src/App.tsx`

```tsx
import { Outlet } from "react-router-dom";
import Navbar from "./components/Navbar";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main>
        <Outlet />
      </main>
    </div>
  );
}
```

### `client/src/main.tsx`

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { RouterProvider } from "react-router-dom";
import { store } from "./app/store";
import { queryClient } from "./lib/queryClient";
import { router } from "./routes/router";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </Provider>
  </StrictMode>
);
```

## How It Works

Trace one interaction: the user opens `http://localhost:5173` in a browser.

1. Vite serves `index.html`, which loads `src/main.tsx` as an ES module.
2. `main.tsx` builds the composition root: `<Provider store={store}>` makes the Redux store
   (currently only `auth: { user: null, accessToken: null, status: "idle" }`) available to
   `useAppSelector`/`useAppDispatch` anywhere in the tree; `<QueryClientProvider>` makes the
   TanStack Query cache available to `useQuery`/`useMutation` anywhere in the tree (unused so
   far, but wired); `<RouterProvider router={router}>` takes over rendering based on the URL.
3. React Router matches `/` against `router.tsx`'s route tree. The top-level route renders `App`,
   which renders `<Navbar />` and an `<Outlet />`. `/` matches the nested `index: true` route,
   which sits inside the `ProtectedRoute` layout route.
4. `ProtectedRoute` runs, reads `state.auth.status` via `useAppSelector` — this is the one and
   only place in this phase that Redux state is read to make a decision. Since `status` is
   `"idle"` (never `"error"`), it renders `<Outlet />`, which resolves to `DashboardPage`.
5. `DashboardPage` renders a static heading. No network request happens — TanStack Query is
   provided but nothing calls `useQuery` yet.
6. The user clicks "Applications" in the Navbar. React Router intercepts the `<Link>` click
   (no full page reload), updates the URL to `/applications`, and swaps `<Outlet>`'s rendered
   child to `ApplicationsPage`, again passing through `ProtectedRoute`'s check.

State-layer ownership at this point in the roadmap: Redux holds exactly one slice
(`auth`, currently inert); TanStack Query holds nothing yet (client created, no queries
registered); routing/URL state is owned entirely by React Router and holds the current path only
(no query params are used until Phase 12).

## End-to-end example

1. Run `npm run dev` inside `client/`.
2. Open `http://localhost:5173`. The Dashboard placeholder page renders behind the Navbar.
3. Click "Applications" — the URL changes to `/applications`, the page renders the Applications
   placeholder, the Navbar stays mounted (it is outside the `<Outlet>` that swaps).
4. Click "Login" — URL changes to `/login`, the Login placeholder renders. Note this route is
   NOT inside `ProtectedRoute`, so it renders regardless of `auth.status`.
5. Manually navigate the browser to `http://localhost:5173/applications/abc-123` — the
   `ApplicationDetailsPage` placeholder renders (route param `:id` is not read yet).
6. Manually navigate to `http://localhost:5173/applications/abc-123/edit` — the
   `ApplicationFormPage` placeholder renders.

## Test This Phase

Manual browser steps (no automated tests yet — that's Phase 13):

1. `npm run dev` starts without errors and prints a `localhost:5173` URL.
2. Visiting `/` shows the Dashboard placeholder with the Navbar on top.
3. Every Navbar link navigates without a full page reload (check the browser Network tab — no
   new `document` request fires on click) and updates the URL bar.
4. Directly loading `/applications/new`, `/applications/xyz`, `/applications/xyz/edit`,
   `/login`, `/register` all render their respective placeholder headings with no console errors.
5. Open React Query Devtools (bottom-of-screen icon) — it opens with an empty query list, proving
   the client is wired even though nothing queries yet.
6. Open Redux DevTools browser extension (if installed) — it shows the `auth` slice with
   `{ user: null, accessToken: null, status: "idle" }`.

Failure indicators: a blank white screen (check the browser console for a router or provider
error — usually a missing `<Outlet>` or an import path typo); Tailwind classes not applying
(check `tailwind.config.js`'s `content` globs match `src/**/*.tsx`); "Cannot find module
react-router-dom" (re-run the install command above inside `client/`, not the repo root).

## Common Failure Points

- Forgetting `withCredentials`/CORS setup does not matter yet — no requests are made in this
  phase, so a backend-not-running situation is invisible here (this will change sharply in
  Phase 9; don't mistake a working Phase 8 for a working Phase 9).
- Placing the `ProtectedRoute` layout route wrong in `router.tsx` (e.g., wrapping `/login` in it)
  would make the public pages redirect. Double-check `/login` and `/register` are siblings of the
  `ProtectedRoute` element, not children of it.
- Using `BrowserRouter` + `<Routes>` JSX instead of `createBrowserRouter` works too, but this
  roadmap standardizes on the data-router API (`createBrowserRouter`/`RouterProvider`) because
  Phase 9's splash-screen bootstrap check reads more naturally with it.
- Tailwind's `@tailwind` directives missing from `index.css`, or `index.css` not imported in
  `main.tsx`, silently drops all styling with no error.

## Common Mistakes

- Adding real logic to `authSlice` "while we're at it" — resist this; Phase 9 owns it, and having
  it there prematurely makes the Phase 9 diff confusing to follow when read as a standalone
  document.
- Making `ProtectedRoute` redirect unconditionally on `!accessToken` in this phase — that would
  make the app permanently redirect to `/login` since nothing ever sets a token, defeating the
  "must still be genuinely runnable" requirement for this phase.
- Forgetting `type` import syntax (`import type { ... }`) for TypeScript-only imports under
  `verbatimModuleSyntax`-style strict configs — not required by the `tsconfig.app.json` above, but
  worth being consistent about for cleaner build output.

## Checkpoint

By the end of this phase you can run `npm run dev` in `client/`, open `http://localhost:5173`,
and click through every route in the app. Nothing fetches data, nothing authenticates, but the
whole shell — Router, Redux, TanStack Query, Navbar, ProtectedRoute — exists and compiles.

## Preparation for the Next Phase

Phase 9 needs: the backend running on `http://localhost:4000` (phases 4–6), this app's `authSlice`
and `ProtectedRoute` as the two files it will most heavily rewrite, and `client/.env`'s
`VITE_API_URL` already pointing at the backend. Phase 9 introduces `api/axiosClient.ts` (the
currently-empty `api/` folder), real thunks in `authSlice.ts`, `LoginForm`/`RegisterForm`
components rendered inside `LoginPage`/`RegisterPage`, and a strict, working `ProtectedRoute`.
