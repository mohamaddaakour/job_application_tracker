# Phase 12 — Filters, Search & Pagination UI

## Goal

Make the Applications list actually usable: an `ApplicationFilters` component (debounced search
text + status dropdown) and pagination controls, both driven entirely by React Router's
`useSearchParams` — never Redux, never local component state — exactly per the spec's state
boundaries. `ApplicationsPage` is rewritten to derive its `useApplications` filters object from
the URL, so the query string is the single source of truth shared by the UI and the data fetch.

## Prerequisites

- Phase 11 complete: `useApplications(filters)`, `ApplicationList`/`ApplicationCard` all work
  against a hardcoded `{ page: 1, limit: 10 }`.
- Backend `GET /api/applications?search=&status=&page=&limit=` implemented per Phase 6.

## What's intentionally deferred

- No "items per page" selector in the UI — `limit` is fixed at 10 as a constant. Nothing in the
  spec calls for a user-adjustable page size, and adding one would be scope creep.
- No filter persistence across sessions (e.g. remembering the last search after logout) — the URL
  is the only source of truth, and a fresh visit to `/applications` with no query string means no
  filters, by design.
- No combined "sort by" control — the spec's list endpoint doesn't define a `sort` param, so
  nothing is built for it.

## Concepts learned

- `useSearchParams` from React Router: reading and writing the URL query string as the state
  container for filter/search/page values.
- Why URL state (not Redux, not `useState`) is correct here: it makes the current view
  bookmarkable/shareable, survives a page refresh without any bootstrap logic, and gives the
  TanStack Query key and the visible UI controls one shared source of truth instead of two things
  that could drift out of sync.
- Debouncing a text input with a small custom `useDebouncedValue` hook, and why: without it, every
  keystroke would produce a new `useApplications` query key and fire a new network request.
- `useMemo` used for a legitimate derived-value case (computing the visible page-number button
  range from `total`/`totalPages`/`page`), explicitly not as a stand-in for a memoized query key
  (TanStack Query already handles key identity by value, so `useMemo` is never needed just to
  "stabilize" a query key).
- Building pagination controls (prev/next + numbered buttons) from a `{ page, totalPages }` pair
  returned by the server.

## Complete project directory structure (end of Phase 12)

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
    │   │   ├── useApplication.ts
    │   │   ├── useApplicationMutations.ts
    │   │   ├── ApplicationCard.tsx
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
    └── lib/
        └── queryClient.ts
```

## Implementation steps

1. Add `src/hooks/useDebouncedValue.ts` — a small generic hook.
2. Add `ApplicationFilters.tsx` — a search input (uncontrolled visually via local state, but the
   *committed*, debounced value is written to the URL) and a status `<select>`, both reading their
   current value from `useSearchParams` and writing back to it.
3. Add `Pagination.tsx` — prev/next buttons plus numbered page buttons, computed with `useMemo`
   from `{ page, totalPages }`, also driven by `useSearchParams`.
4. Rewrite `ApplicationsPage.tsx` to read `search`, `status`, `page` from `useSearchParams`,
   build the `ApplicationFilters` object for `useApplications`, and render
   `ApplicationFilters` + `ApplicationList` + `Pagination`.

## Exact package installs

None — `react-router-dom` (already installed) provides `useSearchParams`.

## Complete file contents

### `client/src/hooks/useDebouncedValue.ts`

```ts
import { useEffect, useState } from "react";

/**
 * Returns a debounced copy of `value` that only updates after `delayMs` has passed
 * without `value` changing. Used for the search input so we don't fire a network
 * request (a new TanStack Query key) on every keystroke - only after the user pauses
 * typing.
 */
export function useDebouncedValue<T>(value: T, delayMs = 400): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeoutId = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timeoutId);
  }, [value, delayMs]);

  return debounced;
}
```

### `client/src/features/applications/ApplicationFilters.tsx`

```tsx
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import type { ApplicationStatus } from "../../types/application";

const STATUS_OPTIONS: ApplicationStatus[] = [
  "APPLIED",
  "INTERVIEW",
  "REJECTED",
  "OFFER",
  "ACCEPTED",
];

/**
 * Search and status filters. Both are stored in the URL via useSearchParams -
 * never in Redux, never in a parent component's useState - so the URL is always
 * the single source of truth that both this component and useApplications read.
 *
 * The search box keeps its own local `inputValue` purely so the <input> feels
 * responsive to every keystroke; that local value is debounced before it is ever
 * written to the URL/committed as a real filter, which is what actually triggers
 * a new TanStack Query fetch.
 */
export default function ApplicationFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const committedSearch = searchParams.get("search") ?? "";
  const status = (searchParams.get("status") ?? "") as ApplicationStatus | "";

  const [inputValue, setInputValue] = useState(committedSearch);
  const debouncedInputValue = useDebouncedValue(inputValue, 400);

  // When the debounced value settles, write it to the URL (and reset to page 1,
  // since the result set has changed).
  useEffect(() => {
    if (debouncedInputValue === committedSearch) return;

    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (debouncedInputValue) {
        next.set("search", debouncedInputValue);
      } else {
        next.delete("search");
      }
      next.set("page", "1");
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedInputValue]);

  const handleStatusChange = (nextStatus: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (nextStatus) {
        next.set("status", nextStatus);
      } else {
        next.delete("status");
      }
      next.set("page", "1");
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <input
        type="text"
        value={inputValue}
        onChange={(event) => setInputValue(event.target.value)}
        placeholder="Search by company or position..."
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none sm:max-w-xs"
      />
      <select
        value={status}
        onChange={(event) => handleStatusChange(event.target.value)}
        className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
      >
        <option value="">All statuses</option>
        {STATUS_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}
```

### `client/src/features/applications/Pagination.tsx`

```tsx
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

interface PaginationProps {
  page: number;
  totalPages: number;
}

/**
 * Pagination is also URL-driven: changing pages sets ?page= in the URL, which
 * ApplicationsPage reads to build the useApplications filters object.
 *
 * useMemo here is a legitimate case: computing the array of page numbers to render
 * is real, non-trivial derived data (not just re-reading a prop), and recomputing it
 * on every unrelated re-render of this component would be wasted work. This is
 * explicitly NOT a substitute for memoizing a TanStack Query key - query keys never
 * need useMemo since TanStack Query compares them by value automatically.
 */
export default function Pagination({ page, totalPages }: PaginationProps) {
  const [, setSearchParams] = useSearchParams();

  const pageNumbers = useMemo(() => {
    const maxButtons = 5;
    const start = Math.max(1, page - Math.floor(maxButtons / 2));
    const end = Math.min(totalPages, start + maxButtons - 1);
    const adjustedStart = Math.max(1, end - maxButtons + 1);

    const pages: number[] = [];
    for (let p = adjustedStart; p <= end; p++) {
      pages.push(p);
    }
    return pages;
  }, [page, totalPages]);

  const goToPage = (nextPage: number) => {
    if (nextPage < 1 || nextPage > totalPages) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("page", String(nextPage));
      return next;
    });
  };

  if (totalPages <= 1) return null;

  return (
    <div className="mt-6 flex items-center justify-center gap-2">
      <button
        onClick={() => goToPage(page - 1)}
        disabled={page <= 1}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-40"
      >
        Prev
      </button>

      {pageNumbers.map((pageNumber) => (
        <button
          key={pageNumber}
          onClick={() => goToPage(pageNumber)}
          className={`rounded-md px-3 py-1.5 text-sm ${
            pageNumber === page
              ? "bg-indigo-600 text-white"
              : "border border-gray-300 text-gray-700 hover:bg-gray-50"
          }`}
        >
          {pageNumber}
        </button>
      ))}

      <button
        onClick={() => goToPage(page + 1)}
        disabled={page >= totalPages}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-40"
      >
        Next
      </button>
    </div>
  );
}
```

### `client/src/pages/ApplicationsPage.tsx`

```tsx
import { Link, useSearchParams } from "react-router-dom";
import { useApplications } from "../features/applications/useApplications";
import ApplicationList from "../features/applications/ApplicationList";
import ApplicationFilters from "../features/applications/ApplicationFilters";
import Pagination from "../features/applications/Pagination";
import LoadingSpinner from "../components/LoadingSpinner";
import ErrorMessage from "../components/ErrorMessage";
import type { ApplicationStatus } from "../types/application";

const PAGE_LIMIT = 10;

export default function ApplicationsPage() {
  const [searchParams] = useSearchParams();

  const search = searchParams.get("search") ?? undefined;
  const status = (searchParams.get("status") ?? undefined) as
    | ApplicationStatus
    | undefined;
  const page = Number(searchParams.get("page") ?? "1") || 1;

  const applicationsQuery = useApplications({
    search,
    status,
    page,
    limit: PAGE_LIMIT,
  });

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

      <div className="mt-6">
        <ApplicationFilters />
      </div>

      <div className="mt-6">
        {applicationsQuery.isLoading && <LoadingSpinner label="Loading applications..." />}
        {applicationsQuery.isError && (
          <ErrorMessage message="Could not load applications." />
        )}
        {applicationsQuery.data && (
          <>
            <ApplicationList applications={applicationsQuery.data.data} />
            <Pagination
              page={applicationsQuery.data.page}
              totalPages={applicationsQuery.data.totalPages}
            />
          </>
        )}
      </div>
    </div>
  );
}
```

## How It Works

Trace: the user types "goog" into the search box, then clicks "APPLIED" in the status dropdown,
then clicks page 2.

1. `ApplicationFilters` mounts with `inputValue` initialized from `searchParams.get("search")`
   (empty string on first visit). The user types "g", "o", "o", "g" — each keystroke updates
   `inputValue` via local `useState`, so the `<input>` is instantly responsive with zero
   network activity so far.
2. `useDebouncedValue(inputValue, 400)` only updates its returned value 400ms after the *last*
   keystroke. Until then, `debouncedInputValue` still equals `""`, so the `useEffect` watching it
   does nothing.
3. 400ms after the "g" in "goog" is typed, `debouncedInputValue` becomes `"goog"`. The `useEffect`
   fires: it compares against `committedSearch` (`""`), sees a difference, and calls
   `setSearchParams` to set `?search=goog&page=1` in the URL — a real browser history entry via
   React Router, without a full page navigation.
4. `ApplicationsPage`, subscribed to `useSearchParams`, re-renders with `search: "goog"`,
   `page: 1`. Its `useApplications({ search: "goog", status: undefined, page: 1, limit: 10 })`
   call now has a *different* query key than before (`["applications", { search: "goog", ... }]`),
   so TanStack Query treats it as a fresh query, shows loading state, and fires
   `GET /api/applications?search=goog&page=1&limit=10`.
5. The user clicks "APPLIED" in the status `<select>`. `handleStatusChange("APPLIED")` writes
   `?search=goog&status=APPLIED&page=1` to the URL in one atomic `setSearchParams` call (again
   resetting `page` to 1, since the result set changes).
6. `ApplicationsPage` re-renders again with the new `status`, builds a new filters object, and
   `useApplications` fires a new request with both `search` and `status` params.
7. The response comes back with `{ data: [...], page: 1, limit: 10, total: 3, totalPages: 1 }`.
   Since `totalPages <= 1`, `Pagination` renders nothing.
8. Suppose instead `totalPages` is 4. The user clicks page button "2" in `Pagination`. `goToPage(2)`
   calls `setSearchParams` to set `?...&page=2`. `ApplicationsPage` re-renders, `useApplications`
   fires with `page: 2`, and the list swaps to page 2's results — the search and status filters
   remain untouched in the URL since `goToPage` only patches the `page` key.

State-layer ownership in this entire trace: the URL (via `useSearchParams`) is the *only* place
`search`, `status`, and `page` live — not Redux, not a parent component's `useState`. TanStack
Query owns the fetched data itself, keyed off values read from the URL. The only local component
state anywhere in this flow is `ApplicationFilters`'s `inputValue`, which exists solely to make
typing feel instant before debouncing commits it to the real, shared filter state.

## End-to-end example

1. Seed 25 applications across companies "Acme", "Globex", "Initech" with a mix of statuses.
2. Visit `/applications` with no query string — URL bar shows plain `/applications`, page 1 of 3
   (10 per page) renders, `Pagination` shows "1 2 3" with "Prev" disabled.
3. Type "acme" in the search box. After a short pause, the URL updates to
   `/applications?search=acme&page=1` and the list narrows to only Acme's applications; if that's
   under 10 results, `Pagination` disappears.
4. Clear the search box, select "INTERVIEW" from the status dropdown — URL becomes
   `/applications?status=INTERVIEW&page=1`, list narrows accordingly.
5. Copy the URL, open it in a new private browser tab (while logged in as the same user in that
   tab too) — the same filtered, same-page results render immediately, proving the filter state
   is fully carried by the URL alone.
6. Click page "2" — URL updates to `...&page=2`, list swaps, "Prev" becomes enabled.

## Test This Phase

1. Type quickly in the search box and watch the Network tab — only one request should fire per
   pause in typing, not one per keystroke.
2. Refresh the browser while on `/applications?search=acme&status=INTERVIEW&page=2` — the exact
   same filtered view renders after reload (proves URL-as-source-of-truth, no reliance on
   in-memory state that a refresh would wipe).
3. Change the search term while on page 3 of results — confirm `page` resets to 1 automatically
   (otherwise the user could land on a "page 3 of 1" empty state).
4. With fewer than `limit` results, confirm `Pagination` renders nothing (no stray "Prev/Next"
   buttons with nothing to page through).
5. Click "Next" repeatedly to the last page — "Next" becomes disabled exactly at `totalPages`.

Failure indicators: a request firing on every keystroke (debounce not wired, or `delayMs` too
low to notice); filters resetting unexpectedly on unrelated re-renders (usually caused by reading
`searchParams` with a fresh `new URLSearchParams()` object each render without memoizing the
*read* side — note only the mutation side needs care here, since `searchParams.get(...)` calls are
cheap and don't need `useMemo`).

## Common Failure Points

- Forgetting to reset `page` to `1` when `search` or `status` changes — leads to a "page 4 of 1"
  broken/empty state that looks like a bug in the list itself.
- Debounce cleanup: forgetting `clearTimeout` in `useDebouncedValue`'s effect cleanup causes stale
  timers to fire after the component using them has moved on to a newer value, occasionally
  reverting the debounced value backward. The implementation above includes the cleanup — do not
  remove it "to simplify."
- Reading and writing `useSearchParams` inconsistently across two components (e.g. `Pagination`
  reading `page` from a prop passed down from `ApplicationsPage` instead of reading it directly)
  is fine as long as there's exactly one place (`ApplicationsPage`) parsing the URL into typed
  values and everything else either reads that or writes back through `setSearchParams` — mixing
  in a second independent read path risks drift.

## Common Mistakes

- Storing `search`/`status`/`page` in a Redux slice "since we already have Redux set up" — this
  directly violates the spec's explicit state-boundary rule and reintroduces exactly the
  "two sources of truth" problem `useSearchParams` was chosen to avoid.
- Debouncing the status `<select>` — unnecessary and actually feels laggy; a `<select>` change is
  a single discrete event, not a stream of keystrokes, so it should commit to the URL immediately
  (as shown above).
- Using `useMemo` to "memoize" the `useApplications` filters object out of a mistaken belief that
  TanStack Query needs referential stability in its query key — it does not; keys are compared by
  deep value equality (via serialization), so a freshly-created object literal every render is
  completely fine and is exactly what the example `ApplicationsPage` does above.

## Checkpoint

Search, status filtering, and pagination all work from the browser, are fully reflected in and
driven by the URL, and a bookmarked/shared filtered URL reproduces the exact same view on load.

## Preparation for the Next Phase

Phase 13 needs: every hook and component built across phases 9–12 as the units under test —
`LoginForm`, `useApplications`, `ApplicationCard`, and `ProtectedRoute` are named explicitly in
that phase's test list. It will add Vitest, React Testing Library, and MSW configured to stub
the exact endpoints these components and hooks call (`/api/auth/*`, `/api/applications*`), so
those tests run without a live backend.
