# Phase 9 — Frontend Authentication

## Goal

Wire real authentication end to end: an axios instance with an interceptor implementing the
access/refresh token dance, a real `authSlice` with async thunks for register/login/logout/
bootstrap-on-load, `LoginForm`/`RegisterForm` built with `react-hook-form` + Zod, a strictly
enforced `ProtectedRoute`, and a working Navbar logout. At the end of this phase a user can
register, log in, refresh the page and stay logged in, and log out — all against the real running
backend from phases 4–6.

## Prerequisites

- Phase 8 complete: app shell, router, placeholder `authSlice`, placeholder `ProtectedRoute`,
  Navbar all exist and the app runs.
- Backend running on `http://localhost:4000` with `/api/auth/register`, `/api/auth/login`,
  `/api/auth/refresh`, `/api/auth/logout`, `/api/auth/me` implemented per phases 4–6, CORS
  configured for origin `http://localhost:5173` with `credentials: true`.
- `client/.env` has `VITE_API_URL=http://localhost:4000/api`.

## What's intentionally deferred

- No application data fetching yet (Phase 10). Once logged in, the Dashboard/Applications pages
  still render their Phase 8 placeholder text.
- No refresh-token revocation UI or "sessions" management — the spec has no such endpoint; this
  is a named backend limitation, not something the frontend works around.
- No "remember me" or persisted login across browser restarts beyond what the httpOnly refresh
  cookie already provides — there is deliberately no `localStorage` token caching (see below).
- No password-reset flow — out of scope per the subject.

## Concepts learned

- Why an access token that lives only in memory (Redux) is safer against XSS than one in
  `localStorage`, and what that costs you (it disappears on every full page reload).
- The httpOnly refresh-cookie pattern: the browser sends it automatically on same-site requests
  (`withCredentials: true` on the client, `credentials: true` + matching CORS origin on the
  server); JavaScript can never read or steal it.
- Axios response interceptors for transparent 401 → refresh → retry.
- `react-hook-form` + `zod` via `@hookform/resolvers/zod` for typed, schema-validated forms.
- Redux Toolkit `createAsyncThunk` and its three lifecycle actions (`pending`/`fulfilled`/
  `rejected`) handled with `extraReducers`.
- Session bootstrap on app load: why every SPA with in-memory tokens needs a "loading" splash
  state before it can decide whether to render protected content.

## Complete project directory structure (end of Phase 9)

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
    │   └── AuthSplash.tsx
    ├── features/
    │   ├── auth/
    │   │   ├── authSlice.ts
    │   │   ├── authApi.ts
    │   │   ├── LoginForm.tsx
    │   │   └── RegisterForm.tsx
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
    ├── types/
    │   └── auth.ts
    └── lib/
        └── queryClient.ts
```

## Implementation steps

1. Install `axios`, `react-hook-form`, `zod`, `@hookform/resolvers`.
2. Add `src/types/auth.ts` with shared auth types.
3. Write `src/api/axiosClient.ts` — the shared axios instance with the refresh interceptor. It
   needs a way to read/update the Redux access token and to dispatch logout without creating an
   import cycle with the store, so it holds injected references set once at app startup.
4. Write `src/features/auth/authApi.ts` — thin functions calling the five auth endpoints via
   `axiosClient`.
5. Rewrite `src/features/auth/authSlice.ts` with real state, `createAsyncThunk`s for register,
   login, logout, and `bootstrapAuth` (session restore on load), and reducers wired via
   `extraReducers`.
6. Wire `axiosClient`'s injected store reference in `main.tsx` (after the store is created, before
   the app renders) to avoid a circular import between `store.ts` and `axiosClient.ts`.
7. Build `LoginForm.tsx` and `RegisterForm.tsx` with `react-hook-form` + Zod resolvers matching
   the backend's Zod validation rules.
8. Update `LoginPage`/`RegisterPage` to render the forms, redirecting to `/` if already
   authenticated.
9. Add `AuthSplash.tsx` — a tiny full-screen loading state shown while `bootstrapAuth` is
   in flight.
10. Rewrite `ProtectedRoute.tsx` to strictly enforce auth and show `AuthSplash` during bootstrap.
11. Dispatch `bootstrapAuth()` once on app mount (in `App.tsx`), before the router renders any
    protected content.
12. Wire the Navbar's logout button to dispatch the real `logout` thunk and redirect to `/login`.

## Exact package installs

Run inside `client/`:

```bash
npm install axios react-hook-form zod @hookform/resolvers
```

## Complete file contents

### `client/src/types/auth.ts`

```ts
export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthResponse {
  user: AuthUser;
  accessToken: string;
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}
```

### `client/src/api/axiosClient.ts`

```ts
import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";

/**
 * Shared axios instance.
 *
 * `withCredentials: true` is required so the browser attaches the httpOnly `refreshToken`
 * cookie set by the backend on /api/auth/login|register|refresh, and so the backend's
 * Set-Cookie / clear-cookie responses are honored. The backend's CORS config must allow
 * origin http://localhost:5173 with credentials: true for this to work (phases 3-4).
 *
 * The access token itself is never stored here or in localStorage — it is injected per
 * request from the Redux store via `setAccessTokenGetter`, wired once in main.tsx.
 */
export const axiosClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
});

type AccessTokenGetter = () => string | null;
type OnRefreshed = (newAccessToken: string) => void;
type OnRefreshFailed = () => void;

let getAccessToken: AccessTokenGetter = () => null;
let onRefreshed: OnRefreshed = () => {};
let onRefreshFailed: OnRefreshFailed = () => {};

/**
 * Called once from main.tsx after the Redux store exists, so this module never imports
 * the store directly (avoids a circular import between store.ts -> authSlice.ts ->
 * authApi.ts -> axiosClient.ts -> store.ts).
 */
export function configureAxiosAuthHooks(hooks: {
  getAccessToken: AccessTokenGetter;
  onRefreshed: OnRefreshed;
  onRefreshFailed: OnRefreshFailed;
}) {
  getAccessToken = hooks.getAccessToken;
  onRefreshed = hooks.onRefreshed;
  onRefreshFailed = hooks.onRefreshFailed;
}

axiosClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  // Use a bare axios call (not axiosClient) to avoid re-entering the response interceptor.
  const response = await axios.post<{ accessToken: string }>(
    `${import.meta.env.VITE_API_URL}/auth/refresh`,
    {},
    { withCredentials: true }
  );
  return response.data.accessToken;
}

axiosClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetriableConfig | undefined;

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.url?.includes("/auth/refresh")
    ) {
      originalRequest._retry = true;
      try {
        // Coalesce concurrent 401s into a single refresh call.
        if (!refreshPromise) {
          refreshPromise = refreshAccessToken().finally(() => {
            refreshPromise = null;
          });
        }
        const newAccessToken = await refreshPromise;
        onRefreshed(newAccessToken);

        originalRequest.headers = originalRequest.headers ?? {};
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return axiosClient(originalRequest);
      } catch (refreshError) {
        onRefreshFailed();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);
```

### `client/src/features/auth/authApi.ts`

```ts
import { axiosClient } from "../../api/axiosClient";
import type {
  AuthResponse,
  AuthUser,
  LoginPayload,
  RegisterPayload,
} from "../../types/auth";

export async function registerRequest(
  payload: RegisterPayload
): Promise<AuthResponse> {
  const { data } = await axiosClient.post<AuthResponse>(
    "/auth/register",
    payload
  );
  return data;
}

export async function loginRequest(
  payload: LoginPayload
): Promise<AuthResponse> {
  const { data } = await axiosClient.post<AuthResponse>("/auth/login", payload);
  return data;
}

export async function logoutRequest(): Promise<void> {
  await axiosClient.post("/auth/logout");
}

export async function refreshRequest(): Promise<{ accessToken: string }> {
  const { data } = await axiosClient.post<{ accessToken: string }>(
    "/auth/refresh"
  );
  return data;
}

export async function meRequest(): Promise<AuthUser> {
  const { data } = await axiosClient.get<AuthUser>("/auth/me");
  return data;
}
```

### `client/src/features/auth/authSlice.ts`

```ts
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import {
  loginRequest,
  logoutRequest,
  meRequest,
  refreshRequest,
  registerRequest,
} from "./authApi";
import type { AuthUser, LoginPayload, RegisterPayload } from "../../types/auth";

export type AuthStatus = "idle" | "loading" | "authenticated" | "error";

export interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  status: AuthStatus;
  error: string | null;
}

const initialState: AuthState = {
  user: null,
  accessToken: null,
  status: "idle",
  error: null,
};

export const registerUser = createAsyncThunk(
  "auth/register",
  async (payload: RegisterPayload) => {
    return registerRequest(payload);
  }
);

export const loginUser = createAsyncThunk(
  "auth/login",
  async (payload: LoginPayload) => {
    return loginRequest(payload);
  }
);

export const logoutUser = createAsyncThunk("auth/logout", async () => {
  await logoutRequest();
});

/**
 * Runs once when the app mounts. There is no access token in memory yet (a hard
 * refresh wipes Redux state), so the only way to know whether the user has a valid
 * session is to ask the backend using the httpOnly refresh cookie, which the browser
 * sends automatically. If it succeeds we get a fresh access token and the user's
 * profile; if it fails (no cookie, expired cookie) we're simply logged out.
 */
export const bootstrapAuth = createAsyncThunk("auth/bootstrap", async () => {
  const { accessToken } = await refreshRequest();
  const user = await meRequest();
  return { accessToken, user };
});

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setAccessToken(state, action: { payload: string }) {
      state.accessToken = action.payload;
    },
    forceLogout(state) {
      state.user = null;
      state.accessToken = null;
      state.status = "idle";
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(registerUser.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(registerUser.fulfilled, (state, action) => {
        state.status = "authenticated";
        state.user = action.payload.user;
        state.accessToken = action.payload.accessToken;
      })
      .addCase(registerUser.rejected, (state, action) => {
        state.status = "error";
        state.error = action.error.message ?? "Registration failed";
      })
      .addCase(loginUser.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.status = "authenticated";
        state.user = action.payload.user;
        state.accessToken = action.payload.accessToken;
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.status = "error";
        state.error = action.error.message ?? "Login failed";
      })
      .addCase(logoutUser.fulfilled, (state) => {
        state.user = null;
        state.accessToken = null;
        state.status = "idle";
        state.error = null;
      })
      .addCase(bootstrapAuth.pending, (state) => {
        state.status = "loading";
      })
      .addCase(bootstrapAuth.fulfilled, (state, action) => {
        state.status = "authenticated";
        state.user = action.payload.user;
        state.accessToken = action.payload.accessToken;
      })
      .addCase(bootstrapAuth.rejected, (state) => {
        // No valid session cookie (or it expired) - this is a normal, expected
        // outcome for a first-time or logged-out visitor, not necessarily an error.
        state.user = null;
        state.accessToken = null;
        state.status = "idle";
      });
  },
});

export const { setAccessToken, forceLogout } = authSlice.actions;
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

*(Unchanged from Phase 8 — shown for completeness since `client/` state is cumulative.)*

### `client/src/app/hooks.ts`

```ts
import { useDispatch, useSelector } from "react-redux";
import type { TypedUseSelectorHook } from "react-redux";
import type { RootState, AppDispatch } from "./store";

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
```

*(Unchanged from Phase 8.)*

### `client/src/features/auth/LoginForm.tsx`

```tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { loginUser } from "./authSlice";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginForm() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const authError = useAppSelector((state) => state.auth.error);
  const status = useAppSelector((state) => state.auth.status);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (values: LoginFormValues) => {
    const result = await dispatch(loginUser(values));
    if (loginUser.fulfilled.match(result)) {
      navigate("/", { replace: true });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700">
          Email
        </label>
        <input
          id="email"
          type="email"
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          {...register("email")}
        />
        {errors.email && (
          <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700">
          Password
        </label>
        <input
          id="password"
          type="password"
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          {...register("password")}
        />
        {errors.password && (
          <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
        )}
      </div>

      {authError && status === "error" && (
        <p className="text-sm text-red-600">{authError}</p>
      )}

      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        {status === "loading" ? "Logging in..." : "Log in"}
      </button>
    </form>
  );
}
```

### `client/src/features/auth/RegisterForm.tsx`

```tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { registerUser } from "./authSlice";

const registerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type RegisterFormValues = z.infer<typeof registerSchema>;

export default function RegisterForm() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const authError = useAppSelector((state) => state.auth.error);
  const status = useAppSelector((state) => state.auth.status);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (values: RegisterFormValues) => {
    const result = await dispatch(registerUser(values));
    if (registerUser.fulfilled.match(result)) {
      navigate("/", { replace: true });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700">
          Name
        </label>
        <input
          id="name"
          type="text"
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          {...register("name")}
        />
        {errors.name && (
          <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700">
          Email
        </label>
        <input
          id="email"
          type="email"
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          {...register("email")}
        />
        {errors.email && (
          <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700">
          Password
        </label>
        <input
          id="password"
          type="password"
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          {...register("password")}
        />
        {errors.password && (
          <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
        )}
      </div>

      {authError && status === "error" && (
        <p className="text-sm text-red-600">{authError}</p>
      )}

      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        {status === "loading" ? "Creating account..." : "Register"}
      </button>
    </form>
  );
}
```

### `client/src/pages/LoginPage.tsx`

```tsx
import { Navigate } from "react-router-dom";
import { useAppSelector } from "../app/hooks";
import LoginForm from "../features/auth/LoginForm";

export default function LoginPage() {
  const status = useAppSelector((state) => state.auth.status);

  if (status === "authenticated") {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-2xl font-bold text-gray-900">Login</h1>
      <div className="mt-6">
        <LoginForm />
      </div>
      <p className="mt-4 text-sm text-gray-500">
        No account? <a href="/register" className="text-indigo-600">Register</a>
      </p>
    </div>
  );
}
```

### `client/src/pages/RegisterPage.tsx`

```tsx
import { Navigate } from "react-router-dom";
import { useAppSelector } from "../app/hooks";
import RegisterForm from "../features/auth/RegisterForm";

export default function RegisterPage() {
  const status = useAppSelector((state) => state.auth.status);

  if (status === "authenticated") {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-2xl font-bold text-gray-900">Register</h1>
      <div className="mt-6">
        <RegisterForm />
      </div>
      <p className="mt-4 text-sm text-gray-500">
        Already have an account? <a href="/login" className="text-indigo-600">Login</a>
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

*(Unchanged from Phase 8.)*

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

*(Unchanged from Phase 8.)*

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

*(Unchanged from Phase 8.)*

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

*(Unchanged from Phase 8.)*

### `client/src/components/AuthSplash.tsx`

```tsx
export default function AuthSplash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <p className="text-sm text-gray-500">Loading your session...</p>
    </div>
  );
}
```

### `client/src/components/ProtectedRoute.tsx`

```tsx
import { Navigate, Outlet } from "react-router-dom";
import { useAppSelector } from "../app/hooks";
import AuthSplash from "./AuthSplash";

/**
 * Strict version. `App.tsx` dispatches `bootstrapAuth()` once on mount, which sets
 * status to "loading" while it calls POST /auth/refresh (using the httpOnly cookie)
 * then GET /auth/me. Until that resolves we show a splash instead of guessing.
 */
export default function ProtectedRoute() {
  const status = useAppSelector((state) => state.auth.status);

  if (status === "idle" || status === "loading") {
    return <AuthSplash />;
  }

  if (status !== "authenticated") {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
```

### `client/src/components/Navbar.tsx`

```tsx
import { Link, useNavigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../app/hooks";
import { logoutUser } from "../features/auth/authSlice";

export default function Navbar() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { user, status } = useAppSelector((state) => state.auth);
  const isAuthenticated = status === "authenticated";

  const handleLogout = async () => {
    await dispatch(logoutUser());
    navigate("/login", { replace: true });
  };

  return (
    <nav className="flex items-center justify-between bg-white px-6 py-4 shadow-sm">
      <Link to="/" className="text-lg font-semibold text-gray-900">
        Job Application Tracker
      </Link>
      <div className="flex items-center gap-4 text-sm font-medium text-gray-600">
        {isAuthenticated ? (
          <>
            <Link to="/" className="hover:text-gray-900">
              Dashboard
            </Link>
            <Link to="/applications" className="hover:text-gray-900">
              Applications
            </Link>
            <span className="text-gray-400">{user?.name}</span>
            <button
              onClick={handleLogout}
              className="rounded-md bg-gray-100 px-3 py-1.5 text-gray-700 hover:bg-gray-200"
            >
              Logout
            </button>
          </>
        ) : (
          <>
            <Link to="/login" className="hover:text-gray-900">
              Login
            </Link>
            <Link to="/register" className="hover:text-gray-900">
              Register
            </Link>
          </>
        )}
      </div>
    </nav>
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

*(Unchanged from Phase 8 — shown for completeness.)*

### `client/src/App.tsx`

```tsx
import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import Navbar from "./components/Navbar";
import { useAppDispatch } from "./app/hooks";
import { bootstrapAuth } from "./features/auth/authSlice";

export default function App() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    dispatch(bootstrapAuth());
  }, [dispatch]);

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
import { configureAxiosAuthHooks } from "./api/axiosClient";
import { forceLogout, setAccessToken } from "./features/auth/authSlice";
import "./index.css";

// Wire axiosClient's interceptor to the Redux store without a circular import:
// axiosClient never imports store.ts directly.
configureAxiosAuthHooks({
  getAccessToken: () => store.getState().auth.accessToken,
  onRefreshed: (newAccessToken) => store.dispatch(setAccessToken(newAccessToken)),
  onRefreshFailed: () => store.dispatch(forceLogout()),
});

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

### Trace 1: fresh login

1. User navigates to `/login`. `LoginPage` reads `auth.status` — it's `"idle"` or already
   resolved to `"idle"` by a failed `bootstrapAuth` — so it renders `LoginForm`.
2. User types an email/password and submits. `react-hook-form`'s `handleSubmit` runs the Zod
   `loginSchema` first; if either field fails validation, `onSubmit` never runs and the inline
   `errors.email.message` / `errors.password.message` render instead.
3. On valid input, `onSubmit` dispatches `loginUser({ email, password })`, a `createAsyncThunk`.
   Redux Toolkit immediately dispatches `loginUser.pending`, setting `status: "loading"` — the
   submit button disables and shows "Logging in...".
4. The thunk calls `loginRequest`, which calls `axiosClient.post("/auth/login", payload)`. The
   axios instance sends the request to `http://localhost:4000/api/auth/login` with
   `withCredentials: true`.
5. The backend validates, verifies the password hash, issues a JWT access token in the JSON body
   and sets the `refreshToken` httpOnly cookie in the response.
6. Back on the client, `loginUser.fulfilled` fires with `{ user, accessToken }`. The reducer sets
   `state.auth.user`, `state.auth.accessToken`, and `status: "authenticated"`.
7. `onSubmit`'s `if (loginUser.fulfilled.match(result))` check passes, and `navigate("/", { replace: true })`
   sends the user to the Dashboard.
8. `ProtectedRoute` re-renders (it's subscribed to `auth.status` via `useAppSelector`), sees
   `"authenticated"`, and renders the real `<Outlet />` instead of `AuthSplash`.

State-layer ownership in this trace: Redux (`auth` slice) is the only place `accessToken` and
`user` ever live on the client — never `localStorage`, never component state. React Router owns
only the URL/navigation. Form field values and validation errors live in `react-hook-form`'s
internal state, not Redux.

### Trace 2: hard page refresh while logged in

1. User is on `/applications` with `auth.status === "authenticated"`. They press browser refresh.
2. The entire JS runtime restarts — Redux state resets to `initialState`
   (`{ user: null, accessToken: null, status: "idle" }`). The in-memory access token is gone; this
   is the deliberate cost of not using `localStorage`.
3. `main.tsx` re-runs, `App` mounts, its `useEffect` dispatches `bootstrapAuth()`.
4. `bootstrapAuth.pending` sets `status: "loading"`. `ProtectedRoute` (matched again by the router
   for `/applications`) sees `"loading"` and renders `<AuthSplash />` instead of the Applications
   page or bouncing to `/login` — this is the "small loading/splash state" the spec calls for.
5. `bootstrapAuth`'s thunk body calls `refreshRequest()` → `POST /auth/refresh`. The browser
   automatically attaches the httpOnly `refreshToken` cookie (JavaScript never touched it). The
   backend verifies it, issues a brand new access token.
6. The thunk then calls `meRequest()` → `GET /auth/me` using the fresh access token attached by
   the request interceptor (which reads from `getAccessToken()` — but the interceptor reads from
   the Redux store, and at this instant the store doesn't have the new token yet since the thunk
   hasn't resolved). To keep this correct, `meRequest()` runs after `refreshAccessToken`'s result
   is used directly by the thunk rather than round-tripping through the store first — see the
   thunk body: it awaits `refreshRequest()` for the token and passes it forward in the same async
   function before dispatching `fulfilled`, so `GET /auth/me`'s request goes out only after
   `bootstrapAuth.fulfilled` has not yet updated Redux, meaning `axiosClient`'s request
   interceptor would still attach `null`. This is why `bootstrapAuth` must set the token before
   calling `/auth/me` — see the implementation note below.
7. `bootstrapAuth.fulfilled` sets `user`, `accessToken`, `status: "authenticated"`.
   `ProtectedRoute` re-renders and shows the Applications page.
8. If the cookie is missing or expired, `refreshRequest()` rejects, `bootstrapAuth.rejected` fires,
   `status` becomes `"idle"`, and `ProtectedRoute` redirects to `/login`.

**Implementation note on step 6**: because `axiosClient`'s request interceptor reads the token
from the Redux store (via `getAccessToken`) rather than from a local variable, and `GET /auth/me`
is called from inside the same thunk before `fulfilled` commits state, the `/auth/me` call in
`bootstrapAuth` would go out with `Authorization: Bearer null`. The backend's `authenticate`
middleware would reject that with 401, triggering the response interceptor's refresh-and-retry
path — which calls `/auth/refresh` a second, redundant time before succeeding. This is functionally
correct (the response interceptor's 401→refresh→retry path exists exactly to cover this kind of
gap) but wastes one request. If you want to avoid the extra round trip, dispatch
`setAccessToken(accessToken)` immediately after `refreshRequest()` resolves, inside the
`bootstrapAuth` thunk body, before calling `meRequest()`. Either approach ends in the same
correct authenticated state; the roadmap calls out the tradeoff explicitly rather than hiding it.

## End-to-end example

1. With the backend running, open `http://localhost:5173/register`.
2. Fill in Name "Ada Lovelace", Email "ada@example.com", Password "password123", submit.
3. Network tab shows `POST /api/auth/register` returning `201` with
   `{ user: {...}, accessToken: "..." }` and a `Set-Cookie: refreshToken=...; HttpOnly` response
   header. The app redirects to `/` and the Navbar now shows "Ada Lovelace" and a Logout button.
4. Press browser refresh. Briefly see "Loading your session..." then the Dashboard placeholder
   reappears with the Navbar still showing "Ada Lovelace" — proving the session survived the
   refresh via the cookie, not via any client-side storage.
5. Click Logout. `POST /api/auth/logout` fires, the backend clears the `refreshToken` cookie, the
   app redirects to `/login`, and the Navbar reverts to Login/Register links.
6. Refresh the page again while logged out — briefly "Loading your session...", then
   `bootstrapAuth` fails (no cookie), and since `/login` isn't inside `ProtectedRoute` it simply
   renders normally.

## Test This Phase

1. Register a new user through the UI; confirm the row appears in the database (e.g. via Prisma
   Studio from Phase 2) with a bcrypt hash, not a plaintext password.
2. Log out, then log back in with the same credentials — should succeed and redirect to `/`.
3. Attempt login with a wrong password — the form should show the server's error message inline
   (not just console-log it), and `status` should return to `"error"` without permanently locking
   the form.
4. While logged in, refresh the page several times in a row — should never flash the login page
   before settling on the Dashboard.
5. Manually delete the `refreshToken` cookie via DevTools Application tab, then refresh — should
   land on `/login`.
6. Try navigating directly to `/applications` while logged out — should redirect to `/login`
   (strict `ProtectedRoute` enforcement, unlike Phase 8).
7. Try navigating to `/login` while already logged in — should redirect to `/`.

Failure indicators: infinite redirect loop between `/` and `/login` (usually a `status` that never
leaves `"loading"` — check `bootstrapAuth.rejected` is actually reached on failure); CORS errors
in the console (`Access-Control-Allow-Credentials` missing — backend CORS config issue, not a
client bug); a "flash of login page" before the splash — means `ProtectedRoute`'s `"idle"`/
`"loading"` branch isn't being checked before the `!== "authenticated"` branch.

## Common Failure Points

- Circular imports between `store.ts` and `axiosClient.ts` if you import the store directly
  inside `axiosClient.ts` instead of using the `configureAxiosAuthHooks` injection pattern shown
  above.
- Forgetting `withCredentials: true` on the raw `axios.post` call inside `refreshAccessToken()` —
  it's easy to only set it on the shared `axiosClient` instance and forget the bare `axios` call
  used to avoid re-entering the interceptor.
- Backend CORS configured with `origin: "*"` — this is incompatible with `credentials: true`
  cookies per the CORS spec; the backend must echo the exact `http://localhost:5173` origin.
- Race condition on multiple simultaneous 401s: without the `refreshPromise` coalescing shown
  above, three parallel failed requests would trigger three separate refresh calls, and the
  backend would rotate/invalidate tokens unpredictably (this project has no rotation, but it's
  still wasteful and worth avoiding).

## Common Mistakes

- Storing the access token in `localStorage` "just to make the refresh problem go away" — this
  directly contradicts the spec's security rationale (XSS blast radius) and is one of the primary
  teaching points of this project; don't do it even temporarily.
- Putting `user`/`accessToken` reads inside individual page components via `useSelector` scattered
  everywhere instead of centralizing the authenticated-gate logic in `ProtectedRoute` — leads to
  inconsistent redirect behavior page by page.
- Validating only on the client and trusting it — the backend's Zod schemas (phase 4) are the
  real gate; the frontend Zod schemas here exist for UX (instant feedback), not security, and
  must mirror the backend's rules (min password length, required fields) without assuming they
  replace it.

## Checkpoint

A user can register, log in, have their session survive a hard refresh, and log out — all via the
real backend, with the access token never touching persistent client storage.

## Preparation for the Next Phase

Phase 10 needs: a working authenticated session (so `Authorization` headers are attached
automatically by `axiosClient`), and will add `features/applications/` and `features/dashboard/`
files (currently empty placeholders) containing TanStack Query hooks that call
`GET /api/applications` and `GET /api/applications/stats` using this same `axiosClient`.
