## Project: Personal Job Application Tracker

Build a web app where a user can track the jobs they apply to.

Think of it as a small version of a personal LinkedIn job tracker, but **not** a full job board.

### Core idea

A user can:

* Create an account / log in
* Add a job application
* See all their applications
* Filter/search applications
* Update an application's status
* Edit/delete applications
* View a small dashboard with statistics

That's enough. **Don't add chat, notifications, payments, admin panels, AI, real-time features, etc.**

---

## Recommended stack

| Layer          | Technology           |
| -------------- | -------------------- |
| Frontend       | React + TypeScript   |
| State          | Redux              |
| Server state   | TanStack Query       |
| Backend        | Express + TypeScript |
| Database       | PostgreSQL           |
| ORM            | Prisma               |
| Authentication | JWT + refresh token  |
| Validation     | Zod                  |
| Testing        | Vitest               |
| Styling        | Tailwind CSS         |

This stack is particularly good for you because it combines the React concepts you've been studying with the Express/TypeScript skills you already have.

---

# Features

### 1. Authentication

Keep it simple:

```text
Register
   ↓
Login
   ↓
Access application dashboard
```

Implement:

* Register
* Login
* Logout
* Protected routes
* Password hashing
* Access token
* Refresh token
* Authentication middleware

This alone gives you important backend experience.

---

### 2. Job applications CRUD

Each application could contain:

```text
JobApplication
├── id
├── company
├── position
├── location
├── jobUrl
├── status
├── appliedAt
├── notes
├── createdAt
└── updatedAt
```

Status:

```text
APPLIED
INTERVIEW
REJECTED
OFFER
ACCEPTED
```

Then implement:

```text
POST   /applications
GET    /applications
GET    /applications/:id
PATCH  /applications/:id
DELETE /applications/:id
```

This is the heart of the project.

---

### 3. Search + filtering

For example:

```text
Search: "Software Engineer"

Status:
[ All ]
[ Applied ]
[ Interview ]
[ Rejected ]
[ Offer ]
[ Accepted ]
```

Backend:

```text
GET /applications?search=engineer&status=INTERVIEW
```

This teaches you something very important:

> Don't fetch everything and perform all filtering in React.

Let the backend/database do the filtering.

---

### 4. Pagination

Don't make it complicated.

For example:

```text
GET /applications?page=2&limit=10
```

Response:

```json
{
  "data": [...],
  "page": 2,
  "limit": 10,
  "total": 37,
  "totalPages": 4
}
```

This is a very useful intermediate-level backend concept.

---

### 5. Dashboard

A simple dashboard:

```text
┌─────────────────────────────────────────┐
│ Applications                            │
│                                         │
│  Total       Interviews    Offers       │
│   32             7            2         │
│                                         │
│  Applied:    18                         │
│  Rejected:    5                         │
│  Accepted:    1                         │
└─────────────────────────────────────────┘
```

Backend:

```text
GET /applications/stats
```

Don't build complicated charts. A few cards are enough.

---

# React concepts you'll practice

This project should force you to use React properly rather than just creating components.

### Components

For example:

```text
App
├── Navbar
├── ProtectedRoute
├── Dashboard
│   ├── StatsCards
│   ├── ApplicationFilters
│   └── ApplicationList
│       └── ApplicationCard
│
└── Applications
    ├── ApplicationForm
    └── ApplicationDetails
```

### React concepts

You'll practice:

* React Router
* TypeScript props
* Forms
* Controlled inputs
* Custom hooks
* `useEffect`
* `useState`
* `useMemo` where appropriate
* Redux
* TanStack Query
* Mutations
* Loading states
* Error states
* Optimistic UI where appropriate
* Reusable components
* Form validation with Zod
* Protected routes

---

# Express concepts you'll practice

This is where the project becomes useful for passing the entry-level stage.

Structure it something like:

```text
src/
├── controllers/
├── routes/
├── services/
├── middlewares/
├── schemas/
├── utils/
├── types/
├── app.ts
└── server.ts
```

You'll practice:

```text
Request
  ↓
Route
  ↓
Middleware
  ↓
Controller
  ↓
Service
  ↓
Prisma
  ↓
PostgreSQL
```

This architecture is much more important than adding 30 features.

---

# Important backend requirements

Don't just make CRUD endpoints.

Implement:

### Authentication middleware

```text
Request
   ↓
authenticate()
   ↓
Controller
```

### Authorization

A user must only be able to access **their own applications**.

For example:

```text
User A
 ├── Application 1
 ├── Application 2

User B
 ├── Application 3
```

User A should never be able to:

```http
GET /applications/3
```

even if they know the ID.

This is an important entry → intermediate-level concept.

---

# Database

Keep the database small:

```text
User
 │
 │ 1
 │
 │ *
 ▼
JobApplication
```

That's it.

You don't need 10 tables.

---

# 20-day plan

I'd structure it like this:

| Days  | Goal                              |
| ----- | --------------------------------- |
| 1–2   | Project setup + database design   |
| 3–4   | Express architecture + Prisma     |
| 5–6   | Authentication                    |
| 7–9   | Applications CRUD                 |
| 10    | Authorization + security          |
| 11    | Search + filtering                |
| 12    | Pagination                        |
| 13    | Statistics endpoint               |
| 14–15 | React structure + routing         |
| 16    | Application CRUD UI               |
| 17    | TanStack Query + Redux          |
| 18    | Dashboard + filters               |
| 19    | Testing + error handling          |
| 20    | Refactoring + README + deployment |

The key is that **each day should produce something runnable**.

---

# What I would NOT add

This is important because you said you don't want too many features.

Don't add:

* ❌ Admin dashboard
* ❌ Email notifications
* ❌ WebSockets
* ❌ Chat
* ❌ AI
* ❌ Resume parser
* ❌ Job scraping
* ❌ OAuth
* ❌ File uploads
* ❌ Dark mode
* ❌ Complex analytics
* ❌ Microservices
* ❌ Docker/Kubernetes complexity
* ❌ Multiple user roles

You want to demonstrate **depth**, not feature count.

---

## What makes this "intermediate"?

The project itself isn't difficult because of the number of features.

It's intermediate because you'll have to correctly handle:

```text
Authentication
      ↓
Authorization
      ↓
Validation
      ↓
CRUD
      ↓
Database relations
      ↓
Filtering
      ↓
Pagination
      ↓
Server state
      ↓
Client state
      ↓
Error handling
      ↓
Testing
```

That's much closer to what I'd expect from someone trying to move from **"I can build React/Express applications"** to **"I understand how to build a proper small production-style application."**

### My target for you

By the end, you should be able to explain every part of:

```text
React + TypeScript
       │
       │ HTTP
       ▼
Express + TypeScript
       │
       │ Prisma
       ▼
 PostgreSQL
```

and answer questions such as:

> Why TanStack Query instead of Redux for this data?

> Why should authorization happen on the backend?

> Why hash passwords?

> Why use refresh tokens?

> Why validate data on the backend if React already validates it?

> Why paginate at the database/API level?

> Why separate controllers and services?

If you can comfortably answer those questions **and build this project without blindly copying code**, you've made a meaningful step beyond entry level.