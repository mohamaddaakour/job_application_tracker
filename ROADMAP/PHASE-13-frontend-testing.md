# Phase 13 — Frontend Testing

## Goal

Add automated frontend tests: Vitest + React Testing Library + MSW (Mock Service Worker) to stub
the exact `/api/*` endpoints from the spec at the network boundary, so tests run without a live
backend. Cover: `LoginForm` validation + submit behavior, the `useApplications` TanStack Query
hook, `ApplicationCard` rendering, and a `ProtectedRoute` redirect test.

## Prerequisites

- Phases 8–12 complete: the full frontend app exists — auth, dashboard, list, form/details,
  filters/pagination.
- Node.js 18+, npm.

## What's intentionally deferred

- No end-to-end (browser-automation) tests (Playwright/Cypress) — the spec's testing section
  names Vitest + RTL + MSW only for the frontend; a full E2E layer is a reasonable future
  improvement but out of this roadmap's scope.
- No visual regression / snapshot testing — RTL's philosophy (test behavior, not implementation
  detail markup) is followed throughout; snapshot tests are deliberately avoided as they tend to
  rot without catching real bugs.
- Not every component gets a test — this phase demonstrates the four patterns explicitly required
  (form validation, a query hook, a presentational component, a route guard) rather than chasing
  100% coverage, consistent with the subject's "depth over feature count" framing applied to
  testing as well.

## Concepts learned

- Vitest as a Vite-native test runner: `vite.config.ts`'s `test` block vs. a separate
  `vitest.config.ts`.
- React Testing Library: querying by role/label text (accessible queries) instead of test ids,
  `render`, `screen`, `userEvent` for realistic interactions, `waitFor`/`findBy*` for async UI.
- MSW: defining request handlers that intercept `fetch`/`axios` calls at the network layer (not by
  mocking `axios` itself), so components and hooks under test run their real code paths.
- Testing a TanStack Query hook in isolation using a small `renderHook` wrapper that supplies a
  fresh `QueryClientProvider` per test.
- Testing a Redux-and-router-aware component (`ProtectedRoute`) by wrapping it with a real
  `<Provider>` (a test store) and a memory router, rather than trying to shallow-render around
  them.

## Complete project directory structure (end of Phase 13)

```
client/
├── package.json
├── tsconfig.json
├── tsconfig.app.json
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
    ├── api/
    │   └── axiosClient.ts
    ├── app/
    │   ├── store.ts
    │   └── hooks.ts
    ├── components/
    │   ├── Navbar.tsx
    │   ├── ProtectedRoute.tsx
    │   ├── ProtectedRoute.test.tsx
    │   ├── AuthSplash.tsx
    │   ├── LoadingSpinner.tsx
    │   └── ErrorMessage.tsx
    ├── features/
    │   ├── auth/
    │   │   ├── authSlice.ts
    │   │   ├── authApi.ts
    │   │   ├── LoginForm.tsx
    │   │   ├── LoginForm.test.tsx
    │   │   └── RegisterForm.tsx
    │   ├── applications/
    │   │   ├── applicationsApi.ts
    │   │   ├── useApplications.ts
    │   │   ├── useApplications.test.tsx
    │   │   ├── useApplication.ts
    │   │   ├── useApplicationMutations.ts
    │   │   ├── ApplicationCard.tsx
    │   │   ├── ApplicationCard.test.tsx
    │   │   ├── ApplicationList.tsx
    │   │   ├── ApplicationForm.tsx
    │   │   ├── ApplicationFilters.tsx
    │   │   ├── Pagination.tsx
    │   │   └── StatusSelect.tsx
    │   └── dashboard/
    │       ├── useStats.ts
    │       └── StatsCards.tsx
    ├── hooks/
    │   └── useDebouncedValue.ts
    ├── pages/
    │   ├── LoginPage.tsx
    │   ├── RegisterPage.tsx
    │   ├── DashboardPage.tsx
    │   ├── ApplicationsPage.tsx
    │   ├── ApplicationFormPage.tsx
    │   └── ApplicationDetailsPage.tsx
    ├── routes/
    │   └── router.tsx
    ├── types/
    │   ├── auth.ts
    │   └── application.ts
    ├── lib/
    │   └── queryClient.ts
    └── test/
        ├── setupTests.ts
        ├── server.ts
        ├── handlers.ts
        └── testUtils.tsx
```

## Implementation steps

1. Install Vitest, React Testing Library, `@testing-library/user-event`, `@testing-library/jest-dom`,
   `jsdom`, and MSW.
2. Add a `test` block to `client/vite.config.ts` (`environment: "jsdom"`, `setupFiles`).
3. Write `src/test/setupTests.ts` — imports `@testing-library/jest-dom`, starts/stops the MSW
   server around the test suite.
4. Write `src/test/handlers.ts` — MSW request handlers for every endpoint touched by the tests in
   this phase (`/auth/login`, `/applications`).
5. Write `src/test/server.ts` — the MSW Node server built from those handlers.
6. Write `src/test/testUtils.tsx` — a `renderWithProviders` helper wrapping a component with a
   fresh Redux store, a fresh `QueryClient`, and a router, so individual tests don't repeat this
   boilerplate.
7. Write `LoginForm.test.tsx`.
8. Write `useApplications.test.tsx`.
9. Write `ApplicationCard.test.tsx`.
10. Write `ProtectedRoute.test.tsx`.
11. Add an npm `test` script and run the suite.

## Exact package installs

```bash
npm install -D vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom msw
```

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
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@hookform/resolvers": "^3.9.0",
    "@reduxjs/toolkit": "^2.2.7",
    "@tanstack/react-query": "^5.59.0",
    "@tanstack/react-query-devtools": "^5.59.0",
    "axios": "^1.7.7",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-hook-form": "^7.53.0",
    "react-redux": "^9.1.2",
    "react-router-dom": "^6.26.2",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.1",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.20",
    "jsdom": "^25.0.1",
    "msw": "^2.4.9",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.13",
    "typescript": "^5.5.4",
    "vite": "^5.4.6",
    "vitest": "^2.1.1"
  }
}
```

*(Cumulative — includes every dependency installed across phases 8–13.)*

### `client/vite.config.ts`

```ts
/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setupTests.ts"],
    globals: true,
    css: false,
  },
});
```

### `client/src/test/handlers.ts`

```ts
import { http, HttpResponse } from "msw";
import type { AuthResponse } from "../types/auth";
import type { ApplicationListResponse } from "../types/application";

const API_URL = "http://localhost:4000/api";

const mockUser = { id: "user-1", email: "ada@example.com", name: "Ada Lovelace" };

const mockApplication = {
  id: "app-1",
  company: "Acme Corp",
  position: "Backend Engineer",
  location: "Remote",
  jobUrl: null,
  status: "APPLIED" as const,
  appliedAt: "2026-01-15T00:00:00.000Z",
  notes: null,
  userId: mockUser.id,
  createdAt: "2026-01-15T00:00:00.000Z",
  updatedAt: "2026-01-15T00:00:00.000Z",
};

export const handlers = [
  http.post(`${API_URL}/auth/login`, async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string };

    if (body.email === "ada@example.com" && body.password === "password123") {
      const response: AuthResponse = { user: mockUser, accessToken: "mock-access-token" };
      return HttpResponse.json(response, { status: 200 });
    }

    return HttpResponse.json(
      { error: { message: "Invalid email or password" } },
      { status: 401 }
    );
  }),

  http.get(`${API_URL}/applications`, () => {
    const response: ApplicationListResponse = {
      data: [mockApplication],
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
    };
    return HttpResponse.json(response, { status: 200 });
  }),
];
```

### `client/src/test/server.ts`

```ts
import { setupServer } from "msw/node";
import { handlers } from "./handlers";

export const server = setupServer(...handlers);
```

### `client/src/test/setupTests.ts`

```ts
import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./server";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

### `client/src/test/testUtils.tsx`

```tsx
import type { ReactElement, ReactNode } from "react";
import { render } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import authReducer, { type AuthState } from "../features/auth/authSlice";

interface RenderOptions {
  preloadedAuthState?: Partial<AuthState>;
  route?: string;
}

/**
 * Builds a fresh Redux store + fresh QueryClient per test (so tests never share
 * cache state) and wraps children in a MemoryRouter, mirroring the real provider
 * tree from main.tsx without needing a browser URL.
 */
export function renderWithProviders(
  ui: ReactElement,
  { preloadedAuthState, route = "/" }: RenderOptions = {}
) {
  const store = configureStore({
    reducer: { auth: authReducer },
    preloadedState: {
      auth: {
        user: null,
        accessToken: null,
        status: "idle",
        error: null,
        ...preloadedAuthState,
      },
    },
  });

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider store={store}>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
        </QueryClientProvider>
      </Provider>
    );
  }

  return { store, queryClient, ...render(ui, { wrapper: Wrapper }) };
}

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}
```

### `client/src/features/auth/LoginForm.test.tsx`

```tsx
import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginForm from "./LoginForm";
import { renderWithProviders } from "../../test/testUtils";

describe("LoginForm", () => {
  it("shows validation errors for an empty submit", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);

    await user.click(screen.getByRole("button", { name: /log in/i }));

    expect(
      await screen.findByText(/enter a valid email address/i)
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/password must be at least 8 characters/i)
    ).toBeInTheDocument();
  });

  it("logs in successfully with valid credentials", async () => {
    const user = userEvent.setup();
    const { store } = renderWithProviders(<LoginForm />);

    await user.type(screen.getByLabelText(/email/i), "ada@example.com");
    await user.type(screen.getByLabelText(/password/i), "password123");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    await waitFor(() => {
      expect(store.getState().auth.status).toBe("authenticated");
    });
    expect(store.getState().auth.user?.email).toBe("ada@example.com");
  });

  it("shows a server error message on invalid credentials", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);

    await user.type(screen.getByLabelText(/email/i), "ada@example.com");
    await user.type(screen.getByLabelText(/password/i), "wrongpassword");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByText(/login failed/i)).toBeInTheDocument();
  });
});
```

### `client/src/features/applications/useApplications.test.tsx`

```tsx
import { describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { useApplications } from "./useApplications";
import { createTestQueryClient } from "../../test/testUtils";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient();
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useApplications", () => {
  it("fetches and returns the applications list from the API", async () => {
    const { result } = renderHook(
      () => useApplications({ page: 1, limit: 10 }),
      { wrapper }
    );

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.data).toHaveLength(1);
    expect(result.current.data?.data[0].company).toBe("Acme Corp");
    expect(result.current.data?.total).toBe(1);
  });
});
```

### `client/src/features/applications/ApplicationCard.test.tsx`

```tsx
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import ApplicationCard from "./ApplicationCard";
import { renderWithProviders } from "../../test/testUtils";
import type { JobApplication } from "../../types/application";

const application: JobApplication = {
  id: "app-1",
  company: "Acme Corp",
  position: "Backend Engineer",
  location: "Remote",
  jobUrl: null,
  status: "INTERVIEW",
  appliedAt: "2026-01-15T00:00:00.000Z",
  notes: null,
  userId: "user-1",
  createdAt: "2026-01-15T00:00:00.000Z",
  updatedAt: "2026-01-15T00:00:00.000Z",
};

describe("ApplicationCard", () => {
  it("renders position, company, location, and status", () => {
    renderWithProviders(<ApplicationCard application={application} />);

    expect(screen.getByText("Backend Engineer")).toBeInTheDocument();
    expect(screen.getByText(/acme corp/i)).toBeInTheDocument();
    expect(screen.getByText(/remote/i)).toBeInTheDocument();
    expect(screen.getByText("INTERVIEW")).toBeInTheDocument();
  });

  it("links to the application's details page", () => {
    renderWithProviders(<ApplicationCard application={application} />);

    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/applications/app-1"
    );
  });
});
```

### `client/src/components/ProtectedRoute.test.tsx`

```tsx
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";
import { renderWithProviders } from "../test/testUtils";

function TestApp() {
  return (
    <Routes>
      <Route path="/login" element={<div>Login Page</div>} />
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<div>Dashboard Page</div>} />
      </Route>
    </Routes>
  );
}

describe("ProtectedRoute", () => {
  it("redirects to /login when not authenticated", () => {
    renderWithProviders(<TestApp />, {
      route: "/",
      preloadedAuthState: { status: "idle" },
    });

    expect(screen.getByText("Login Page")).toBeInTheDocument();
    expect(screen.queryByText("Dashboard Page")).not.toBeInTheDocument();
  });

  it("shows the splash while bootstrapping", () => {
    renderWithProviders(<TestApp />, {
      route: "/",
      preloadedAuthState: { status: "loading" },
    });

    expect(screen.getByText(/loading your session/i)).toBeInTheDocument();
  });

  it("renders the protected content when authenticated", () => {
    renderWithProviders(<TestApp />, {
      route: "/",
      preloadedAuthState: {
        status: "authenticated",
        user: { id: "user-1", email: "ada@example.com", name: "Ada Lovelace" },
        accessToken: "mock-access-token",
      },
    });

    expect(screen.getByText("Dashboard Page")).toBeInTheDocument();
  });
});
```

## How It Works

Trace: running `npm run test` inside `client/`.

1. Vitest reads the `test` block from `vite.config.ts`, launches a `jsdom` environment (a
   browser-like DOM implemented in Node, since there's no real browser in CI), and runs
   `src/test/setupTests.ts` before any test file.
2. `setupTests.ts` calls `server.listen()` (MSW's Node server) once for the whole run — from this
   point on, any `axios`/`fetch` call made by application code inside a test is intercepted by MSW
   at the network layer, matched against `handlers.ts`, and answered without ever reaching a real
   socket.
3. For `LoginForm.test.tsx`'s "logs in successfully" case: `renderWithProviders` mounts
   `<LoginForm />` inside a real (test-scoped) `<Provider store={testStore}>`, so the component's
   `useAppDispatch`/`useAppSelector` calls work exactly as they do in the real app — this test
   never mocks Redux itself, only the network.
4. `userEvent.type` + `userEvent.click` simulate real user interaction (typing character by
   character, a real click event) rather than calling internal functions directly, so the test
   exercises the same code path a real user triggers.
5. Submitting the form dispatches the real `loginUser` thunk, which calls the real `loginRequest`,
   which calls the real `axiosClient.post("/auth/login", ...)` — MSW's handler for
   `POST http://localhost:4000/api/auth/login` intercepts it, checks the posted body against the
   hardcoded test credentials, and returns the same JSON shape (`{ user, accessToken }`) the real
   backend would.
6. The thunk's `fulfilled` action updates the test store exactly as it would in production; the
   test asserts on `store.getState().auth.status` — checking the actual outcome of the real
   reducer logic, not a mock's call count.
7. `afterEach(() => server.resetHandlers())` in `setupTests.ts` clears any per-test handler
   overrides between tests, so tests never leak state into each other via MSW.

## End-to-end example (of running the suite)

```bash
cd client
npm run test
```

Expected output: four test files run (`LoginForm.test.tsx`, `useApplications.test.tsx`,
`ApplicationCard.test.tsx`, `ProtectedRoute.test.tsx`), each with multiple passing assertions,
and a final summary like:

```
 Test Files  4 passed (4)
      Tests  9 passed (9)
```

## Test This Phase

1. `npm run test` passes cleanly with no backend running — this is the entire point of MSW;
   temporarily stop the Express server (if it happens to be running) and re-run the suite to
   confirm it doesn't matter.
2. Deliberately break `LoginForm`'s Zod schema (e.g. remove the `.email()` check) and confirm the
   "shows validation errors" test fails — proves the test isn't a false positive.
3. Deliberately change the MSW handler's mock company name and confirm `ApplicationCard.test.tsx`
   and `useApplications.test.tsx` both fail on the stale assertion — proves the tests actually
   read from the mocked response rather than hardcoded expectations disconnected from it.
4. Run `npm run test:watch` during development and confirm it re-runs affected tests on save.

Failure indicators: `ReferenceError: fetch is not defined` or similar — usually means
`environment: "jsdom"` is missing from the Vitest config, or MSW's Node server wasn't started
before the test ran; "Unable to find an element with the text" errors on otherwise-correct code —
usually an async timing issue, fixed by using `findBy*`/`waitFor` instead of `getBy*` immediately
after a state-changing interaction.

## Common Failure Points

- Forgetting `onUnhandledRequest: "error"` in `server.listen()` — without it, MSW silently lets
  unmatched requests pass through (or warns quietly), which can mask a typo'd URL in a handler and
  let a test pass for the wrong reason (e.g. hitting a real network address instead of the mock).
- Sharing one `QueryClient` across multiple tests — causes cached data from one test to leak into
  the next, producing tests that only pass in a particular run order. The `createTestQueryClient`/
  `renderWithProviders` helpers above create a fresh instance per call specifically to prevent
  this; always route new tests through them rather than importing the app's real singleton
  `queryClient` from `lib/queryClient.ts`.
- Testing `ProtectedRoute` by mocking `react-redux`'s `useSelector` directly instead of using a
  real store with `preloadedState` — brittle, and stops testing the actual selector logic; the
  approach above uses a real (test) store instead.

## Common Mistakes

- Mocking `axios` itself (e.g. `vi.mock("axios")`) instead of using MSW — this bypasses the real
  `axiosClient` request/response interceptor logic entirely, meaning a broken interceptor
  (e.g. Phase 9's refresh flow) would never be caught by any test. MSW intercepts at the network
  boundary specifically so the real client code always runs.
- Asserting on CSS classes or DOM structure instead of visible text/roles — RTL's
  `getByRole`/`getByLabelText`/`getByText` queries (used throughout above) test what a user
  actually perceives and are far more resilient to refactors than `container.querySelector`.
- Writing one giant "integration" test that renders the whole app and clicks through every flow —
  tempting, but slow and hard to debug when it fails; the four focused tests here each isolate one
  concern (form validation, a query hook, a presentational component, a route guard) precisely
  because the roadmap wants failures to point at a specific broken thing.

## Checkpoint

`npm run test` in `client/` passes a real, meaningful suite — form validation and submission,
a TanStack Query hook's success path, a presentational component's rendered output, and a
route guard's three states (unauthenticated, loading, authenticated) — all without needing the
backend running.

## Preparation for the Next Phase

Phase 14 (production readiness, written separately) assumes both the backend test suite (Phase 7)
and this frontend test suite are green, and will typically wire both into a single root-level
`npm run test` or CI step alongside build scripts and deployment configuration. No further
frontend feature phases follow this one.
