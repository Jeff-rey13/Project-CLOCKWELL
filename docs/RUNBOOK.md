# Runbook

## Local setup

Requirements: Node 20 or newer, pnpm 9, Docker Desktop (running), Deno 2.

```sh
pnpm install
cp .env.example apps/web/.env.local     # then set the publishable key printed by `supabase start`
pnpm exec supabase start                # local stack in Docker
pnpm exec supabase db reset --local     # local only: applies migrations and seed
pnpm functions                          # Edge Functions on http://127.0.0.1:54321/functions/v1
pnpm dev                                # web app on http://localhost:3000 (slow: compiles pages on first visit)
```

For testing or demos use `pnpm preview` instead of `pnpm dev`: it builds the static app (as deployed)
and serves it on http://localhost:3000. Pages load in milliseconds; rebuild after code changes.
Do not run `pnpm build` while `pnpm dev` is running; it breaks the dev server until restarted.

Sign in at `http://localhost:3000/login/?company=harbourline` with a seed user
(`aisyah` employee, `meiling` HR; Meridian: `kenneth`). Seed passwords are for the local stack only.

Local dashboard: `http://127.0.0.1:54323`. Local email inbox (password reset, invites): `http://127.0.0.1:54324`.

To stop: `pnpm exec supabase stop` (keeps local data), stop `pnpm dev` and `pnpm functions`.

## Checks

```sh
pnpm lint && pnpm typecheck && pnpm test
pnpm exec supabase test db
deno test --config supabase/functions/deno.json supabase/functions
pnpm e2e                                # needs the local stack, functions and dev server running
```

## Edge Functions

- Every function verifies the caller's JWT in code (`supabase/functions/_shared/auth.ts`), so
  `verify_jwt = false` is set per function in `supabase/config.toml`. Add a `[functions.<name>]`
  entry when adding a function; the local server will not start if an entry has no folder.
- Shared rules come from `packages/shared` through `supabase/functions/_shared/app.ts`.
- Logs are JSON lines with ids and error codes only. Never log names, emails, coordinates or paths.

## Sign-in

- `username-login` looks up the work email from company slug and username and signs in.
  Any failure returns `INVALID_CREDENTIALS`. Rate limit: 5 attempts per username, 20 per IP, per 15 minutes
  (`private.login_attempts`).
- Claims `company_id`, `app_role`, `is_platform` are added by `public.custom_access_token_hook`
  (enabled in `supabase/config.toml` under `[auth.hook.custom_access_token]`; enable the same hook in
  each remote project's Auth settings).

## Settings to set on every deployed project

| Where | Setting | Value |
|---|---|---|
| Web (Vercel env) | `NEXT_PUBLIC_REQUIRE_HR_MFA` | `true` |
| Function secrets | `REQUIRE_HR_MFA` | `true` |
| Function secrets | `SITE_URL` | the app address, used in invite emails |
| Supabase Auth | Custom Access Token Hook | `public.custom_access_token_hook` |
| Supabase Auth | Sign-ups | off (invite only) |
| Supabase Auth | MFA, TOTP | enroll and verify on |
| Supabase Auth | Redirect URLs | the app address(es), with `/**` |

Locally these are off or open so seed users can sign in without two-step; see `supabase/config.toml`.

## Platform console (vendor team)

Sign in at `platform.<domain>/platform/login` (locally `http://localhost:3000/platform/login/`) with email and
password. Locally: `ops@vendor.test` (owner) and `ops2@vendor.test` (engineer); deleting a company needs both.

Add a team member to a project (once per person, by an owner):

1. Supabase dashboard of the project, Authentication, Users, Invite user: their email.
2. SQL editor: `insert into public.platform_admins (user_id, role) select id, 'owner' from auth.users where email = '<their email>';`
   Roles: `owner` and `engineer` can change companies; `support` can only read.
3. They accept the invite, set a password, then set up two-step sign-in on first sign-in.

Platform users see company names and counts only. Staff data needs a support grant from the company (task 3.2).

## Local test inbox

Invite emails on the local stack go to Mailpit: `http://127.0.0.1:54324`.

## Deploy, rollback, restore

Written in Phase 3 (task 3.8). Remote deploys run only from GitHub Actions started by the owner.
