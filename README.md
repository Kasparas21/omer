# Omer — authenticated onboarding

Live first slice: account registration/sign-in (email or Google) → project creation → copy script/install prompt → first consented installation receipt in PostgreSQL. The UI follows the Unfair Weekend kit (tokens + setup wizard). No Visitors code or token is installed.

## Architecture

The dashboard, Hono API and Better Auth run in a Node 24 container on the Hostinger VPS. Node is the supported fallback in handbook chapter 03. PostgreSQL remains loopback-only on that VPS. Drizzle/pg handles project queries and versioned project migrations; Better Auth uses its PostgreSQL adapter for users, password hashes, sessions, social accounts and auth rate limits.

Cloudflare supplies DNS and a **named tunnel** to **https://app.tryomer.com**. The entire app is on the VPS behind Cloudflare (same origin for SPA + API + auth cookies), not a separate Worker frontend. See [deployment notes](docs/deployment.md). A future `cdn.tryomer.com` can serve the tracker the way Visitors uses `cdn.visitors.now`; today the script is same-origin.

## Local development

Use Node 24, npm and Docker Compose:

```sh
npm ci
docker compose up -d --wait
cp .env.example .env
```

Set a random `BETTER_AUTH_SECRET` in `.env` (for example `openssl rand -hex 32`). The example database password is local-only.

### Google Auth credentials (paste here)

In the project `.env` (gitignored):

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

Create a Google Cloud **Web** OAuth client and add redirect URIs:

- `http://localhost:5173/api/auth/callback/google`
- `https://app.tryomer.com/api/auth/callback/google`

Leave the vars empty until you have the client; email/password keeps working. Production paste location: `/opt/omer/runtime.env` on the VPS (then recreate `omer-app`).

Then:

```sh
npm run db:migrate
npm run dev:api
```

In a second terminal run `npm run dev` and open http://localhost:5173. Vite proxies API/collector requests to localhost:3000. Production serves the built frontend through Hono on the same origin as auth.

Never commit `.env`, a database URL containing real credentials, or the auth secret. Project write keys are public integration identifiers, not account credentials.

## Installation behavior

1. Create an account (Google or email) and a project with the exact website origin.
2. Copy the install prompt into the site's coding assistant, or add the script in its shared head.
3. After the script loads, connect the site's analytics consent choice to `window.unfairweekend.consent({ analytics: true })`. Restore a previous consent choice explicitly; do not silently grant consent.
4. Visit the site and grant analytics consent. Setup polls for the first receipt; it also offers a manual check.

The tracker sends only a public project key and one installation signal per document. The collector enforces input bounds, browser-origin matching and a single-instance rate limit; PostgreSQL stores the first receipt and does not overwrite its timestamp on duplicates.

Local projects permit localhost only when `ALLOW_LOCAL_SITES=true`; production leaves it unset.

## What is and is not complete

Implemented: Better Auth email/password + optional Google OAuth, server-backed sessions, per-account project isolation, kit-styled setup wizard (site → install → check), consent-gated installation receipt, VPS deployment path for `app.tryomer.com`.

Not implemented: email verification/password recovery, brand import, sender DNS/SES, team invitations, full analytics/replay, opportunities or sending. Brand and sender setup steps are visible but locked until those backends exist. Do not describe the installation receipt as complete product onboarding.

## Checks

```sh
npm run check
npm run build
npm audit --omit=dev
npm run test:onboarding
```

The smoke test needs a running local app/database, Chrome, and port 5180. It covers email registration, sign-in, isolation, project persistence, install clipboard/guide, consent gating and a real receipt. It asserts a Google button only when `/api/config` reports `googleAuth: true`.

For deployment verification set `APP_URL=https://app.tryomer.com` and `DEMO_ORIGIN` as documented in the test header comments.

## Planning sources

Sibling `followup-project-v0.2` handbook (revision 0.4), especially chapters 02–04, 08–10, 13, 17–19 and 26–27.
