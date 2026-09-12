# Job Application Tracker — Server

Express + TypeScript backend for the Job Application Tracker. See
`../ROADMAP/00-OVERVIEW.md` and the phase files for the full build sequence.

## Setup

```bash
npm install
cp .env.example .env
```

## Development

```bash
npm run dev
```

Starts the API on http://localhost:4000 with `tsx watch` (auto-restarts on file changes).

## Build & run

```bash
npm run build
npm start
```

Compiles `src/` to `dist/` with `tsc`, then runs the compiled output with Node.

## Environment variables

See `.env.example` for the full list (`PORT`, `CLIENT_URL`, `DATABASE_URL`,
`DATABASE_URL_TEST`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`,
`ACCESS_TOKEN_EXPIRES_IN`, `REFRESH_TOKEN_EXPIRES_IN`). `DATABASE_URL`/JWT values are
unused until Phase 2 (Prisma) and Phase 4 (auth) respectively.
