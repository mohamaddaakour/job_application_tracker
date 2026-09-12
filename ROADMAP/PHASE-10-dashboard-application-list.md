# Phase 10 — Dashboard & Application List

## Goal

Render real server data for the first time: TanStack Query hooks for the applications list and
stats, `StatsCards`, `ApplicationList`/`ApplicationCard`, and wired-up `DashboardPage` (stats +
a handful of recent applications) and `ApplicationsPage` (the plain list, first page only — no
filter UI or pagination controls, those are Phase 12).

## Prerequisites

- Phase 9 complete: a user can log in and `axiosClient` attaches a valid `Authorization` header.
- Backend `GET /api/applications` and `GET /api/applications/stats` implemented per phases 5–6,
  requiring auth and scoped to the logged-in user.
- At least a few `JobApplication` rows exist for the logged-in test user (create them via the
  seed script from Phase 2 or manually via Prisma Studio) so the list/stats aren't empty during
  testing.

## What's intentionally deferred

- No filter inputs, no status dropdown, no search box, no pagination controls — `ApplicationsPage`
  always requests page 1 with the default limit and just renders whatever comes back. Phase 12
  adds the controls.
- No create/edit/delete UI yet — `ApplicationCard` is read-only, clicking it will navigate to a
  details page whose real content doesn't exist until Phase 11 (it currently renders the Phase 9
  placeholder).
- No optimistic updates — this phase only reads data (`useQuery`), it does not write any
  (`useMutation` starts in Phase 11).

## Concepts learned

- TanStack Query `useQuery`: query keys, `queryFn`, `staleTime`, derived loading/error states.
- Structuring server-state hooks by feature (`features/applications/hooks.ts`,
  `features/dashboard/hooks.ts`) that wrap `axiosClient` calls, so components never call axios
  directly.
- Why TanStack Query — not Redux — owns this data: caching, automatic refetch-on-mount dedup,
  and no manual "loading" booleans to hand-wire, versus Redux which would require thunks +
  reducers + manual cache invalidation for the exact same behavior. This is the concrete
  demonstration of the spec's core teaching point.
- Designing simple, composable list/card components that accept typed props derived from the
  shared `JobApplication` type.
- Basic loading/error/empty state handling patterns for a data-fetching UI.

## Complete project directory structure (end of Phase 10)

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
    │   ├── AuthSplash.tsx
    │   ├── LoadingSpinner.tsx
    │   └── ErrorMessage.tsx
    ├── features/
    │   ├── auth/
    │   │   ├── authSlice.ts
    │   │   ├── authApi.ts
    │   │   ├── LoginForm.tsx
    │   │   └── RegisterForm.tsx
    │   ├── applications/
    │   │   ├── applicationsApi.ts
    │   │   ├── useApplications.ts
    │   │   ├── ApplicationCard.tsx
    │   │   └── ApplicationList.tsx
    │   └── dashboard/
    │       ├── useStats.ts
    │       └── StatsCards.tsx
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
    │   ├── auth.ts
    │   └── application.ts
    └── lib/
        └── queryClient.ts
```

## Implementation steps

1. Add `src/types/application.ts` with the `JobApplication`, `ApplicationStatus`,
   `ApplicationListResponse`, and `Stats` types mirroring the spec's shapes exactly.
2. Write `src/features/applications/applicationsApi.ts` — `getApplications(filters)` and
   `getApplicationById(id)` (the latter used starting Phase 11, but defined now alongside its
   sibling for cohesion — actually deferred to Phase 11 to avoid referencing an unused function;
   only `getApplications` and `getStats` are added here).
3. Write `src/features/applications/useApplications.ts` wrapping `useQuery` with the
   `['applications', filters]` key.
4. Write `src/features/dashboard/useStats.ts` wrapping `useQuery` with the `['stats']` key.
5. Write small shared `LoadingSpinner`/`ErrorMessage` components under `components/`.
6. Write `ApplicationCard.tsx` and `ApplicationList.tsx`.
7. Write `StatsCards.tsx`.
8. Wire `DashboardPage.tsx` to call `useStats()` and `useApplications({ page: 1, limit: 5 })` for
   a "recent applications" preview.
9. Wire `ApplicationsPage.tsx` to call `useApplications({ page: 1, limit: 10 })` and render
   `ApplicationList`.

## Exact package installs

None — this phase only uses packages already installed in phases 8–9
(`@tanstack/react-query`, `axios`, `react-router-dom`).

## Complete file contents

### `client/src/types/application.ts`

```ts
export type ApplicationStatus =
  | "APPLIED"
  | "INTERVIEW"
  | "REJECTED"
  | "OFFER"
  | "ACCEPTED";

export interface JobApplication {
  id: string;
  company: string;
  position: string;
  location: string | null;
  jobUrl: string | null;
  status: ApplicationStatus;
  appliedAt: string;
  notes: string | null;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationListResponse {
  data: JobApplication[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApplicationFilters {
  search?: string;
  status?: ApplicationStatus | "";
  page?: number;
  limit?: number;
}

export interface StatsResponse {
  total: number;
  byStatus: Record<ApplicationStatus, number>;
}
```

### `client/src/features/applications/applicationsApi.ts`

```ts
import { axiosClient } from "../../api/axiosClient";
import type {
  ApplicationFilters,
  ApplicationListResponse,
} from "../../types/application";

export async function getApplications(
  filters: ApplicationFilters
): Promise<ApplicationListResponse> {
  const params: Record<string, string | number> = {};
  if (filters.search) params.search = filters.search;
  if (filters.status) params.status = filters.status;
  if (filters.page) params.page = filters.page;
  if (filters.limit) params.limit = filters.limit;

  const { data } = await axiosClient.get<ApplicationListResponse>(
    "/applications",
    { params }
  );
  return data;
}
```

### `client/src/features/applications/useApplications.ts`

```ts
import { useQuery } from "@tanstack/react-query";
import { getApplications } from "./applicationsApi";
import type { ApplicationFilters } from "../../types/application";

/**
 * Server data for the applications list. TanStack Query owns caching/loading/error
 * state here per the spec's state boundaries; the query key includes every filter
 * value so a change to search/status/page/limit is a different cache entry and
 * triggers a refetch automatically.
 */
export function useApplications(filters: ApplicationFilters) {
  return useQuery({
    queryKey: ["applications", filters],
    queryFn: () => getApplications(filters),
  });
}
```

### `client/src/features/dashboard/useStats.ts`

```ts
import { useQuery } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import type { StatsResponse } from "../../types/application";

async function getStats(): Promise<StatsResponse> {
  const { data } = await axiosClient.get<StatsResponse>("/applications/stats");
  return data;
}

export function useStats() {
  return useQuery({
    queryKey: ["stats"],
    queryFn: getStats,
  });
}
```

### `client/src/components/LoadingSpinner.tsx`

```tsx
export default function LoadingSpinner({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-12 text-sm text-gray-500">
      {label}
    </div>
  );
}
```

### `client/src/components/ErrorMessage.tsx`

```tsx
export default function ErrorMessage({
  message = "Something went wrong. Please try again.",
}: {
  message?: string;
}) {
  return (
    <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  );
}
```

### `client/src/features/applications/ApplicationCard.tsx`

```tsx
import { Link } from "react-router-dom";
import type { JobApplication } from "../../types/application";

const statusStyles: Record<JobApplication["status"], string> = {
  APPLIED: "bg-blue-100 text-blue-800",
  INTERVIEW: "bg-amber-100 text-amber-800",
  REJECTED: "bg-red-100 text-red-800",
  OFFER: "bg-purple-100 text-purple-800",
  ACCEPTED: "bg-green-100 text-green-800",
};

export default function ApplicationCard({
  application,
}: {
  application: JobApplication;
}) {
  return (
    <Link
      to={`/applications/${application.id}`}
      className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 hover:border-indigo-300 hover:shadow-sm"
    >
      <div>
        <p className="font-medium text-gray-900">{application.position}</p>
        <p className="text-sm text-gray-500">
          {application.company}
          {application.location ? ` · ${application.location}` : ""}
        </p>
      </div>
      <span
        className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[application.status]}`}
      >
        {application.status}
      </span>
    </Link>
  );
}
```

### `client/src/features/applications/ApplicationList.tsx`

```tsx
import type { JobApplication } from "../../types/application";
import ApplicationCard from "./ApplicationCard";

export default function ApplicationList({
  applications,
}: {
  applications: JobApplication[];
}) {
  if (applications.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-gray-500">
        No applications yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {applications.map((application) => (
        <ApplicationCard key={application.id} application={application} />
      ))}
    </div>
  );
}
```

### `client/src/features/dashboard/StatsCards.tsx`

```tsx
import type { StatsResponse } from "../../types/application";

const STATUS_LABELS: { key: keyof StatsResponse["byStatus"]; label: string }[] = [
  { key: "APPLIED", label: "Applied" },
  { key: "INTERVIEW", label: "Interview" },
  { key: "REJECTED", label: "Rejected" },
  { key: "OFFER", label: "Offer" },
  { key: "ACCEPTED", label: "Accepted" },
];

export default function StatsCards({ stats }: { stats: StatsResponse }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
        <p className="text-xs font-medium uppercase text-gray-500">Total</p>
        <p className="mt-1 text-2xl font-bold text-gray-900">{stats.total}</p>
      </div>
      {STATUS_LABELS.map(({ key, label }) => (
        <div key={key} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
          <p className="text-xs font-medium uppercase text-gray-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {stats.byStatus[key] ?? 0}
          </p>
        </div>
      ))}
    </div>
  );
}
```

### `client/src/pages/DashboardPage.tsx`

```tsx
import { Link } from "react-router-dom";
import { useStats } from "../features/dashboard/useStats";
import { useApplications } from "../features/applications/useApplications";
import StatsCards from "../features/dashboard/StatsCards";
import ApplicationList from "../features/applications/ApplicationList";
import LoadingSpinner from "../components/LoadingSpinner";
import ErrorMessage from "../components/ErrorMessage";

export default function DashboardPage() {
  const statsQuery = useStats();
  const recentQuery = useApplications({ page: 1, limit: 5 });

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      <section className="mt-6">
        {statsQuery.isLoading && <LoadingSpinner label="Loading stats..." />}
        {statsQuery.isError && <ErrorMessage message="Could not load stats." />}
        {statsQuery.data && <StatsCards stats={statsQuery.data} />}
      </section>

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Recent Applications</h2>
          <Link to="/applications" className="text-sm text-indigo-600 hover:underline">
            View all
          </Link>
        </div>
        <div className="mt-4">
          {recentQuery.isLoading && <LoadingSpinner label="Loading applications..." />}
          {recentQuery.isError && (
            <ErrorMessage message="Could not load recent applications." />
          )}
          {recentQuery.data && (
            <ApplicationList applications={recentQuery.data.data} />
          )}
        </div>
      </section>
    </div>
  );
}
```

### `client/src/pages/ApplicationsPage.tsx`

```tsx
import { Link } from "react-router-dom";
import { useApplications } from "../features/applications/useApplications";
import ApplicationList from "../features/applications/ApplicationList";
import LoadingSpinner from "../components/LoadingSpinner";
import ErrorMessage from "../components/ErrorMessage";

export default function ApplicationsPage() {
  const applicationsQuery = useApplications({ page: 1, limit: 10 });

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Applications</h1>
        <Link
          to="/applications/new"
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          New Application
        </Link>
      </div>

      <p className="mt-2 text-sm text-gray-500">
        Showing the first page of results. Search, status filtering, and pagination
        controls are added in Phase 12.
      </p>

      <div className="mt-6">
        {applicationsQuery.isLoading && <LoadingSpinner label="Loading applications..." />}
        {applicationsQuery.isError && (
          <ErrorMessage message="Could not load applications." />
        )}
        {applicationsQuery.data && (
          <ApplicationList applications={applicationsQuery.data.data} />
        )}
      </div>
    </div>
  );
}
```

## How It Works

Trace: the user, already logged in, clicks "Applications" in the Navbar.

1. React Router swaps `<Outlet>`'s content to `ApplicationsPage`. The component function runs and
   calls `useApplications({ page: 1, limit: 10 })`.
2. Inside that hook, `useQuery({ queryKey: ["applications", { page: 1, limit: 10 }], queryFn: ... })`
   is invoked. TanStack Query checks its cache for an entry matching that exact key. On first
   visit there is none, so it immediately runs `queryFn`, and the hook returns
   `{ isLoading: true, data: undefined, ... }` on this render.
3. `ApplicationsPage` renders `<LoadingSpinner />` since `isLoading` is true.
4. `queryFn` calls `getApplications({ page: 1, limit: 10 })`, which calls
   `axiosClient.get("/applications", { params: { page: 1, limit: 10 } })`. The request
   interceptor (Phase 9) attaches `Authorization: Bearer <accessToken>` automatically — the
   component never touches the token.
5. The backend authenticates the request, scopes the Prisma query to `req.user.id`, and returns
   `{ data: [...], page: 1, limit: 10, total: 37, totalPages: 4 }`.
6. TanStack Query stores this response under the `["applications", { page: 1, limit: 10 }]` cache
   key, marks it fresh for `staleTime` (30s, set in `lib/queryClient.ts`), and re-renders
   `ApplicationsPage` with `isLoading: false, data: { ... }`.
7. `ApplicationList` receives `applicationsQuery.data.data` (the array) and maps each item to an
   `ApplicationCard`, which renders company/position/location and a colored status pill.
8. If the user navigates away and back to `/applications` within 30 seconds, TanStack Query
   serves the cached data instantly (no spinner) while silently revalidating in the background
   per its defaults — this is the caching/dedup behavior Redux would require you to hand-build.

State-layer ownership: TanStack Query owns the entire lifecycle of `applications` and `stats`
data — fetching, caching, loading/error flags. Redux is untouched by any of this (it still only
holds `auth`). React Router owns which page is mounted, nothing about the data itself.

## End-to-end example

1. Seed a test user with 6 applications (mixed statuses) via the Phase 2 seed script.
2. Log in as that user.
3. Land on `/` — see six `StatsCards` (Total + one per status) with correct counts, and a "Recent
   Applications" section showing 5 cards (since `limit: 5`), each showing company, position,
   location, and a colored status pill.
4. Click "View all" — navigate to `/applications`, see all 6 in one list (since `limit: 10`
   covers all of them here), with a "New Application" button that currently leads to a Phase 9
   placeholder page (Phase 11 will build it out).
5. Click any card — navigates to `/applications/:id`, which currently renders the placeholder
   "Application Details" heading from Phase 9 (real content in Phase 11).

## Test This Phase

1. With 0 applications seeded, `/applications` shows "No applications yet." and `/` shows all
   stat cards at `0`.
2. With several applications seeded, counts in `StatsCards` match what you'd count manually by
   status.
3. Throttle the network (DevTools → Network → Slow 3G) and confirm the loading spinner shows
   before data appears, rather than a blank flash.
4. Stop the backend server and reload `/applications` — should show the `ErrorMessage` text, not
   a crash or blank page.
5. Log in as a second user with different applications and confirm you only ever see that user's
   data (proves the backend's ownership scoping, not something the frontend enforces itself).

Failure indicators: `401 Unauthorized` on every applications request even though logged in
(access token expired and the Phase 9 interceptor's refresh isn't retrying correctly — re-check
that phase); stats and list disagreeing in total count (check off-by-one in seed data, not a
frontend bug, since both hooks hit different endpoints independently).

## Common Failure Points

- Query key mismatches: if `useApplications` is called with a filters object literal recreated on
  every render with different reference identity but equal values (e.g. `{ page: 1, limit: 10 }`
  written inline), TanStack Query still treats it correctly because it serializes keys by value —
  but be aware of this to avoid confusion when reasoning about cache hits.
- Forgetting the backend list endpoint requires auth — an unauthenticated 401 here surfaces as
  `applicationsQuery.isError`, not a router redirect (that only happens for page-level auth via
  `ProtectedRoute`), so don't expect Phase 9's redirect logic to fire from inside a failed query.
- Rendering `applicationsQuery.data.data` before checking `applicationsQuery.data` exists causes a
  "Cannot read properties of undefined" crash during the loading phase — always gate on
  `isLoading`/`data` presence as shown above.

## Common Mistakes

- Reaching for `useState` + `useEffect` + manual `axios.get` instead of `useQuery` "because it's
  simpler for just one call" — this reintroduces exactly the manual loading/error-state
  bookkeeping TanStack Query exists to remove, and breaks cache sharing between the Dashboard's
  recent-applications preview and the full Applications list.
- Storing the fetched applications array in Redux "to share it between pages" — unnecessary; two
  components calling `useApplications` with different filter objects already get independently
  cached, independently fresh data for free.
- Hardcoding `limit=5` and `limit=10` as magic numbers scattered across files — acceptable at this
  scale per the spec's "don't overbuild" spirit, but keep them visible as literals in the
  `useApplications({ ... })` call sites (as done above) rather than burying them in the hook
  itself, so Phase 12's pagination UI can control them explicitly.

## Checkpoint

The Dashboard shows live stats and a recent-applications preview; the Applications page shows a
live (unfiltered, unpaginated) list. Both use TanStack Query exclusively for server data.

## Preparation for the Next Phase

Phase 11 needs: `types/application.ts`'s shapes (unchanged), `applicationsApi.ts` as the file it
extends with `createApplication`/`updateApplication`/`deleteApplication`/`getApplicationById`,
and `ApplicationCard`/`ApplicationList` as components it will reuse. It also replaces
`ApplicationFormPage`/`ApplicationDetailsPage`'s Phase-9 placeholder bodies with real forms and
detail views, and introduces `useMutation`-based hooks alongside today's `useApplications`/
`useStats` queries.
