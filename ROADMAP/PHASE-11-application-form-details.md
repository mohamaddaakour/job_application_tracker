# Phase 11 — Application Form & Details

## Goal

Make the app write data: a shared `ApplicationForm` (create + edit modes) validated with
`react-hook-form` + Zod, `useCreateApplication`/`useUpdateApplication`/`useDeleteApplication`
TanStack mutations with correct cache invalidation, a real `ApplicationDetailsPage`, a delete
confirmation, and one deliberate optimistic UI update (changing an application's status) with
rollback on error.

## Prerequisites

- Phase 10 complete: `useApplications`/`useStats` queries work, `ApplicationCard`/`ApplicationList`
  render real data, `applicationsApi.ts` and `types/application.ts` exist.
- Backend `POST /api/applications`, `GET /api/applications/:id`, `PATCH /api/applications/:id`,
  `DELETE /api/applications/:id` implemented per Phase 5, all ownership-checked (404 on
  cross-user access, per spec).

## What's intentionally deferred

- No filters/search/pagination UI still — Phase 12.
- No fancy modal library for delete confirmation — a plain `window.confirm` is used, consistent
  with the subject's "don't overbuild" instruction; a custom modal component is a legitimate
  future improvement but not required here.
- Only one interaction is built as an optimistic update (status change). Create/update/delete
  through the form use the simpler "wait for the mutation, then rely on invalidation" pattern —
  building every mutation optimistically would be redundant repetition of the same technique
  without teaching anything new.

## Concepts learned

- `useMutation` (`mutationFn`, `onSuccess`, `onError`, `onSettled`).
- Cache invalidation via `queryClient.invalidateQueries` — targeting both the list/stats keys
  (which must refetch since the underlying data changed) and updating a single-item cache entry
  directly with `queryClient.setQueryData`.
- Optimistic updates: `onMutate` (snapshot + apply the change before the server responds),
  `onError` (roll back to the snapshot), `onSettled` (always resync with the server).
  This is the canonical TanStack Query mutation lifecycle.
- A single form component driving two different mutations (create vs. update) based on a mode
  prop, avoiding duplicated field/validation logic.
- Route params (`useParams`) feeding a `useQuery` for a single resource.

## Complete project directory structure (end of Phase 11)

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
    │   │   └── StatusSelect.tsx
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

1. Extend `applicationsApi.ts` with `getApplicationById`, `createApplication`, `updateApplication`,
   `deleteApplication`.
2. Add `useApplication(id)` — a `useQuery` for a single application.
3. Add `useApplicationMutations.ts` exporting `useCreateApplication`, `useUpdateApplication`,
   `useDeleteApplication`, and `useUpdateApplicationStatus` (the optimistic one), each handling
   cache invalidation/updates.
4. Add `StatusSelect.tsx` — a `<select>` of the 5 enum values, reused by both the form and the
   details page's inline status changer.
5. Add `ApplicationForm.tsx` — shared create/edit form with Zod validation matching the backend's
   create/update schemas.
6. Rewrite `ApplicationFormPage.tsx` to detect create vs. edit mode from the route (`/new` vs.
   `/:id/edit`) via `useParams`, load existing data in edit mode via `useApplication`, and render
   `ApplicationForm`.
7. Rewrite `ApplicationDetailsPage.tsx` with full field display, an inline `StatusSelect` wired to
   the optimistic `useUpdateApplicationStatus` mutation, an Edit link, and a Delete button with a
   `window.confirm` guard wired to `useDeleteApplication`.

## Exact package installs

None — all needed packages (`@tanstack/react-query`, `react-hook-form`, `zod`,
`@hookform/resolvers`) were installed in phases 9–10.

## Complete file contents

### `client/src/features/applications/applicationsApi.ts`

```ts
import { axiosClient } from "../../api/axiosClient";
import type {
  ApplicationFilters,
  ApplicationListResponse,
  ApplicationStatus,
  JobApplication,
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

export async function getApplicationById(id: string): Promise<JobApplication> {
  const { data } = await axiosClient.get<JobApplication>(`/applications/${id}`);
  return data;
}

export interface ApplicationInput {
  company: string;
  position: string;
  location?: string;
  jobUrl?: string;
  status: ApplicationStatus;
  appliedAt: string;
  notes?: string;
}

export async function createApplication(
  input: ApplicationInput
): Promise<JobApplication> {
  const { data } = await axiosClient.post<JobApplication>(
    "/applications",
    input
  );
  return data;
}

export async function updateApplication(
  id: string,
  input: Partial<ApplicationInput>
): Promise<JobApplication> {
  const { data } = await axiosClient.patch<JobApplication>(
    `/applications/${id}`,
    input
  );
  return data;
}

export async function deleteApplication(id: string): Promise<void> {
  await axiosClient.delete(`/applications/${id}`);
}
```

### `client/src/features/applications/useApplication.ts`

```ts
import { useQuery } from "@tanstack/react-query";
import { getApplicationById } from "./applicationsApi";

export function useApplication(id: string | undefined) {
  return useQuery({
    queryKey: ["applications", id],
    queryFn: () => getApplicationById(id as string),
    enabled: Boolean(id),
  });
}
```

### `client/src/features/applications/useApplicationMutations.ts`

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createApplication,
  deleteApplication,
  updateApplication,
  type ApplicationInput,
} from "./applicationsApi";
import type { ApplicationStatus, JobApplication } from "../../types/application";

export function useCreateApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ApplicationInput) => createApplication(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

export function useUpdateApplication(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<ApplicationInput>) => updateApplication(id, input),
    onSuccess: (updated) => {
      queryClient.setQueryData(["applications", id], updated);
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

export function useDeleteApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteApplication(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: ["applications", id] });
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

/**
 * The one deliberate optimistic update in this project (per the roadmap's teaching
 * goal): changing an application's status from the details page should feel instant.
 * We update the cached single-application entry immediately in onMutate, before the
 * network call resolves, and roll back to the snapshot if the server rejects it.
 */
export function useUpdateApplicationStatus(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (status: ApplicationStatus) =>
      updateApplication(id, { status }),

    onMutate: async (newStatus: ApplicationStatus) => {
      await queryClient.cancelQueries({ queryKey: ["applications", id] });

      const previousApplication = queryClient.getQueryData<JobApplication>([
        "applications",
        id,
      ]);

      if (previousApplication) {
        queryClient.setQueryData<JobApplication>(["applications", id], {
          ...previousApplication,
          status: newStatus,
        });
      }

      // Returned here becomes `context` in onError, letting us roll back precisely.
      return { previousApplication };
    },

    onError: (_error, _newStatus, context) => {
      if (context?.previousApplication) {
        queryClient.setQueryData(
          ["applications", id],
          context.previousApplication
        );
      }
    },

    onSettled: () => {
      // Whether it succeeded or was rolled back, resync with the server and any
      // lists/stats that also display this application's status.
      queryClient.invalidateQueries({ queryKey: ["applications", id] });
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}
```

### `client/src/features/applications/StatusSelect.tsx`

```tsx
import type { ApplicationStatus } from "../../types/application";

const STATUS_OPTIONS: ApplicationStatus[] = [
  "APPLIED",
  "INTERVIEW",
  "REJECTED",
  "OFFER",
  "ACCEPTED",
];

export default function StatusSelect({
  value,
  onChange,
  id = "status",
  disabled = false,
}: {
  value: ApplicationStatus;
  onChange: (status: ApplicationStatus) => void;
  id?: string;
  disabled?: boolean;
}) {
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as ApplicationStatus)}
      className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none disabled:opacity-50"
    >
      {STATUS_OPTIONS.map((status) => (
        <option key={status} value={status}>
          {status}
        </option>
      ))}
    </select>
  );
}
```

### `client/src/features/applications/ApplicationForm.tsx`

```tsx
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate } from "react-router-dom";
import StatusSelect from "./StatusSelect";
import type { JobApplication } from "../../types/application";
import type { ApplicationInput } from "./applicationsApi";

const applicationSchema = z.object({
  company: z.string().min(1, "Company is required"),
  position: z.string().min(1, "Position is required"),
  location: z.string().optional(),
  jobUrl: z
    .string()
    .url("Enter a valid URL")
    .optional()
    .or(z.literal("")),
  status: z.enum(["APPLIED", "INTERVIEW", "REJECTED", "OFFER", "ACCEPTED"]),
  appliedAt: z.string().min(1, "Applied date is required"),
  notes: z.string().optional(),
});

type ApplicationFormValues = z.infer<typeof applicationSchema>;

interface ApplicationFormProps {
  mode: "create" | "edit";
  initialData?: JobApplication;
  onSubmit: (input: ApplicationInput) => Promise<unknown>;
  isSubmitting: boolean;
}

function toDateInputValue(isoString: string): string {
  return isoString.slice(0, 10); // "YYYY-MM-DD" for <input type="date">
}

export default function ApplicationForm({
  mode,
  initialData,
  onSubmit,
  isSubmitting,
}: ApplicationFormProps) {
  const navigate = useNavigate();

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ApplicationFormValues>({
    resolver: zodResolver(applicationSchema),
    defaultValues: initialData
      ? {
          company: initialData.company,
          position: initialData.position,
          location: initialData.location ?? "",
          jobUrl: initialData.jobUrl ?? "",
          status: initialData.status,
          appliedAt: toDateInputValue(initialData.appliedAt),
          notes: initialData.notes ?? "",
        }
      : {
          company: "",
          position: "",
          location: "",
          jobUrl: "",
          status: "APPLIED",
          appliedAt: toDateInputValue(new Date().toISOString()),
          notes: "",
        },
  });

  const submit = handleSubmit(async (values) => {
    const input: ApplicationInput = {
      company: values.company,
      position: values.position,
      location: values.location || undefined,
      jobUrl: values.jobUrl || undefined,
      status: values.status,
      appliedAt: new Date(values.appliedAt).toISOString(),
      notes: values.notes || undefined,
    };
    const result = await onSubmit(input);
    const id = (result as JobApplication)?.id ?? initialData?.id;
    navigate(id ? `/applications/${id}` : "/applications");
  });

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="company" className="block text-sm font-medium text-gray-700">
          Company
        </label>
        <input
          id="company"
          type="text"
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          {...register("company")}
        />
        {errors.company && (
          <p className="mt-1 text-sm text-red-600">{errors.company.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="position" className="block text-sm font-medium text-gray-700">
          Position
        </label>
        <input
          id="position"
          type="text"
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          {...register("position")}
        />
        {errors.position && (
          <p className="mt-1 text-sm text-red-600">{errors.position.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="location" className="block text-sm font-medium text-gray-700">
          Location <span className="text-gray-400">(optional)</span>
        </label>
        <input
          id="location"
          type="text"
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          {...register("location")}
        />
      </div>

      <div>
        <label htmlFor="jobUrl" className="block text-sm font-medium text-gray-700">
          Job URL <span className="text-gray-400">(optional)</span>
        </label>
        <input
          id="jobUrl"
          type="text"
          placeholder="https://example.com/job/123"
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          {...register("jobUrl")}
        />
        {errors.jobUrl && (
          <p className="mt-1 text-sm text-red-600">{errors.jobUrl.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="status" className="block text-sm font-medium text-gray-700">
          Status
        </label>
        <Controller
          name="status"
          control={control}
          render={({ field }) => (
            <StatusSelect value={field.value} onChange={field.onChange} id="status" />
          )}
        />
      </div>

      <div>
        <label htmlFor="appliedAt" className="block text-sm font-medium text-gray-700">
          Applied On
        </label>
        <input
          id="appliedAt"
          type="date"
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          {...register("appliedAt")}
        />
        {errors.appliedAt && (
          <p className="mt-1 text-sm text-red-600">{errors.appliedAt.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
          Notes <span className="text-gray-400">(optional)</span>
        </label>
        <textarea
          id="notes"
          rows={4}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          {...register("notes")}
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        {isSubmitting
          ? "Saving..."
          : mode === "create"
          ? "Create Application"
          : "Save Changes"}
      </button>
    </form>
  );
}
```

### `client/src/pages/ApplicationFormPage.tsx`

```tsx
import { useParams } from "react-router-dom";
import ApplicationForm from "../features/applications/ApplicationForm";
import { useApplication } from "../features/applications/useApplication";
import {
  useCreateApplication,
  useUpdateApplication,
} from "../features/applications/useApplicationMutations";
import LoadingSpinner from "../components/LoadingSpinner";
import ErrorMessage from "../components/ErrorMessage";

export default function ApplicationFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = Boolean(id);

  const applicationQuery = useApplication(id);
  const createMutation = useCreateApplication();
  const updateMutation = useUpdateApplication(id ?? "");

  if (isEditMode && applicationQuery.isLoading) {
    return <LoadingSpinner label="Loading application..." />;
  }

  if (isEditMode && applicationQuery.isError) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <ErrorMessage message="Could not load this application." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold text-gray-900">
        {isEditMode ? "Edit Application" : "New Application"}
      </h1>
      <div className="mt-6">
        <ApplicationForm
          mode={isEditMode ? "edit" : "create"}
          initialData={applicationQuery.data}
          isSubmitting={createMutation.isPending || updateMutation.isPending}
          onSubmit={(input) =>
            isEditMode
              ? updateMutation.mutateAsync(input)
              : createMutation.mutateAsync(input)
          }
        />
      </div>
    </div>
  );
}
```

### `client/src/pages/ApplicationDetailsPage.tsx`

```tsx
import { useNavigate, useParams, Link } from "react-router-dom";
import { useApplication } from "../features/applications/useApplication";
import {
  useDeleteApplication,
  useUpdateApplicationStatus,
} from "../features/applications/useApplicationMutations";
import StatusSelect from "../features/applications/StatusSelect";
import LoadingSpinner from "../components/LoadingSpinner";
import ErrorMessage from "../components/ErrorMessage";

export default function ApplicationDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const applicationQuery = useApplication(id);
  const updateStatusMutation = useUpdateApplicationStatus(id ?? "");
  const deleteMutation = useDeleteApplication();

  if (applicationQuery.isLoading) {
    return <LoadingSpinner label="Loading application..." />;
  }

  if (applicationQuery.isError || !applicationQuery.data) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <ErrorMessage message="This application could not be found." />
      </div>
    );
  }

  const application = applicationQuery.data;

  const handleDelete = async () => {
    const confirmed = window.confirm(
      `Delete the application for ${application.position} at ${application.company}? This cannot be undone.`
    );
    if (!confirmed) return;

    await deleteMutation.mutateAsync(application.id);
    navigate("/applications", { replace: true });
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{application.position}</h1>
          <p className="mt-1 text-gray-500">
            {application.company}
            {application.location ? ` · ${application.location}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to={`/applications/${application.id}/edit`}
            className="rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            Edit
          </Link>
          <button
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            {deleteMutation.isPending ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>

      <dl className="mt-8 space-y-4 text-sm">
        <div className="flex items-center gap-3">
          <dt className="w-28 font-medium text-gray-500">Status</dt>
          <dd>
            <StatusSelect
              value={application.status}
              disabled={updateStatusMutation.isPending}
              onChange={(status) => updateStatusMutation.mutate(status)}
            />
          </dd>
        </div>

        <div className="flex gap-3">
          <dt className="w-28 font-medium text-gray-500">Applied On</dt>
          <dd className="text-gray-900">
            {new Date(application.appliedAt).toLocaleDateString()}
          </dd>
        </div>

        {application.jobUrl && (
          <div className="flex gap-3">
            <dt className="w-28 font-medium text-gray-500">Job URL</dt>
            <dd>
              <a
                href={application.jobUrl}
                target="_blank"
                rel="noreferrer"
                className="text-indigo-600 hover:underline"
              >
                {application.jobUrl}
              </a>
            </dd>
          </div>
        )}

        {application.notes && (
          <div className="flex gap-3">
            <dt className="w-28 font-medium text-gray-500">Notes</dt>
            <dd className="whitespace-pre-wrap text-gray-900">{application.notes}</dd>
          </div>
        )}
      </dl>

      <p className="mt-8 text-xs text-gray-400">
        Last updated {new Date(application.updatedAt).toLocaleString()}
      </p>
    </div>
  );
}
```

## How It Works

### Trace: optimistic status change

1. On `ApplicationDetailsPage`, the application's status is `APPLIED`, rendered in `StatusSelect`.
   `useApplication(id)` has this cached under `["applications", id]`.
2. The user picks `INTERVIEW` from the dropdown. `StatusSelect`'s `onChange` calls
   `updateStatusMutation.mutate("INTERVIEW")`.
3. TanStack Query immediately invokes `onMutate("INTERVIEW")`, *before* any network request is
   sent: it cancels any in-flight refetch of `["applications", id]` (`cancelQueries`, to prevent a
   stale response from clobbering the optimistic value), reads and stores the current cached
   value as `previousApplication` (status `APPLIED`), then calls
   `setQueryData(["applications", id], { ...previousApplication, status: "INTERVIEW" })`.
4. Because `ApplicationDetailsPage` reads `applicationQuery.data` via the same query key,
   React re-renders instantly with `status: "INTERVIEW"` in the dropdown and, if it appeared
   elsewhere with a status pill, there too — with zero network latency perceived by the user.
5. `mutationFn` runs in the background: `PATCH /applications/:id` with `{ status: "INTERVIEW" }`.
6. **Success path**: the server confirms; `onSettled` invalidates `["applications", id]`,
   `["applications"]` (any list views), and `["stats"]` (the count buckets shift), triggering
   quiet background refetches that reconcile the cache with the server's authoritative state.
7. **Failure path** (e.g. the network drops, or the server 500s): `onError(error, "INTERVIEW", context)`
   fires with `context.previousApplication` (captured in step 3), and calls
   `setQueryData(["applications", id], context.previousApplication)` — the dropdown snaps back to
   `APPLIED` in the very next render. `onSettled` still runs afterward and invalidates the same
   three keys, so even the rollback gets double-checked against the server rather than trusted
   blindly.

This is the precise mechanism: **onMutate snapshots + applies optimistically, onError restores
the snapshot, onSettled always reconciles** — the three-part contract every TanStack Query
optimistic update follows.

State-layer ownership: the optimistic value lives entirely inside the TanStack Query cache
(`["applications", id]|`), never in component state or Redux — this is what lets any other
component reading the same query key see the optimistic value too, for free.

## End-to-end example

1. From `/applications`, click "New Application". Fill Company "Acme Corp", Position
   "Backend Engineer", leave Location/Job URL/Notes blank, Status "APPLIED", Applied On today.
   Submit.
2. `POST /api/applications` fires, returns the created record with a generated `id`. The form
   navigates to `/applications/<new-id>`, showing the full details page immediately with the just
   created data (no reload).
3. On that page, change Status to "INTERVIEW" via the dropdown — it updates instantly (optimistic).
4. Click "Edit" — navigates to `/applications/<id>/edit`, the form is pre-filled with the current
   values (status now shows "INTERVIEW" since the details view's mutation already updated the
   cache that `useApplication` reads from).
5. Change Position to "Senior Backend Engineer", save — `PATCH` fires, cache updates, redirected
   back to the details page showing the new title.
6. Click "Delete", confirm the browser dialog — `DELETE` fires, redirected to `/applications`,
   and the deleted item's card no longer appears in the (invalidated, refetched) list.

## Test This Phase

1. Create an application with only the required fields (company, position) — should succeed;
   optional fields render as absent (no "Job URL" or "Notes" rows) on the details page.
2. Try submitting the form with company or position blank — inline Zod errors block submission,
   no request is sent (check the Network tab shows nothing fired).
3. Enter an invalid URL in Job URL (e.g. "not a url") — inline error shown, submission blocked.
4. Edit an existing application, confirm the form pre-fills every field correctly, including the
   date input showing the right day.
5. Change status on the details page, then immediately (before it settles) open DevTools Network
   throttling to "Offline" briefly to force the PATCH to fail — confirm the dropdown snaps back to
   the previous value.
6. Delete an application and confirm both the Applications list and the Dashboard's stats update
   (counts shift down) without a manual page refresh.
7. Attempt to load `/applications/<some-other-users-id>/edit` directly — should show the "could
   not be found" error state (backend returns 404 for ownership violations per spec, not 403).

Failure indicators: status rollback never happens on failure (check `onError`'s `context` isn't
`undefined` — usually caused by `onMutate` not returning the snapshot); list/stats not updating
after a mutation (check `invalidateQueries` keys match exactly what `useApplications`/`useStats`
use — `["applications"]` invalidates every filter variant since TanStack Query treats key prefixes
as matching for invalidation purposes).

## Common Failure Points

- Forgetting `cancelQueries` in `onMutate` — a slow in-flight background refetch of the same key
  can resolve *after* your optimistic update and silently overwrite it with stale data.
- Off-by-one date bugs from timezone handling: `toDateInputValue` truncates an ISO string, which
  is timezone-naive; if the backend stores `appliedAt` as UTC midnight and the browser is in a
  negative UTC offset, the date shown in `<input type="date">` could roll back a day. For this
  project's scope this is accepted and not specially corrected — call it out to reviewers rather
  than silently shipping a subtly wrong date.
- Using `mutate` instead of `mutateAsync` inside `ApplicationForm`'s submit handler would prevent
  `await onSubmit(input)` from working (the promise wouldn't be awaited correctly), breaking the
  post-submit navigation.

## Common Mistakes

- Writing three nearly-identical forms (create application, edit application) instead of the one
  shared `ApplicationForm` — duplicates every validation rule and label, and desyncs them over
  time.
- Optimistically updating the *list* query (`["applications", filters]`) as well as the single-item
  query for this one status-change feature — technically possible but adds real complexity (you'd
  need to find and patch the right item inside a paginated array for every active filter
  combination) for a feature this project scopes to a single deliberate example; the roadmap
  intentionally limits optimistic UI to the single-item cache entry.
- Not invalidating `["stats"]` after create/update/delete — a very easy miss that leaves the
  Dashboard's counts silently wrong until the next full reload.

## Checkpoint

A user can create, edit, view details of, and delete an application from the UI, with correct
cache invalidation, and can change an application's status with an optimistic UI update that
correctly rolls back on failure.

## Preparation for the Next Phase

Phase 12 needs: `ApplicationsPage.tsx` as the file it substantially rewrites (adding
`ApplicationFilters` and pagination controls above the existing `ApplicationList`), and
`useApplications(filters)` as the hook whose `filters` argument stops being hardcoded
(`{ page: 1, limit: 10 }`) and starts being derived from `useSearchParams`.
