# Attendance, leave and claims platform

Multi-company attendance, leave and medical claims. The product requirements live in `docs/PRD.md`.

## Requirements

- Node 20 LTS or newer
- pnpm 9 (`npm install -g pnpm@9`)
- Docker Desktop (running)
- Supabase CLI
- Deno

## Setup

```sh
pnpm install
cp .env.example apps/web/.env.local   # fill in the local Supabase publishable key
supabase start                        # local stack, needs Docker
supabase db reset                     # local only: applies migrations and seed
pnpm dev                              # web app on http://localhost:3000
```

Use `?company=<slug>` to choose a company locally, for example `http://localhost:3000/login?company=harbourline`.

## Checks

```sh
pnpm lint && pnpm typecheck && pnpm test
supabase test db
```

## Layout

- `apps/web` Next.js app (static export)
- `packages/shared` brand, error codes, schemas, geo and time helpers shared by web and functions
- `supabase` migrations, Edge Functions, database tests, seed data
- `docs` requirements and runbook
