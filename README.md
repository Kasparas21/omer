# Omer — authenticated onboarding

Live first slice: account registration/sign-in → project creation → copy script/install prompt → first consented installation receipt in PostgreSQL. The UI follows the existing Unfair Weekend visual system. No Visitors code or token is installed.

## Architecture

The dashboard, Hono API and Better Auth run in a Node 24 container on the Hostinger VPS. Node is the supported fallback in handbook chapter 03. PostgreSQL remains loopback-only on that VPS. Drizzle/pg handles project queries and versioned project migrations; Better Auth uses its PostgreSQL adapter for users, password hashes, sessions and auth rate limits.

Cloudflare Tunnel supplies public HTTPS. The current demo uses a free temporary `trycloudflare.com` URL; it is not a permanent CDN hostname. A tunnel restart can change the URL and requires updating APP_URL, restarting the app, and replacing previously installed script URLs. Move to a named tunnel/domain before relying on installed trackers. `app.tryomer.com` can be attached later.

The earlier Cloudflare Worker and anonymous browser-cookie implementation has been replaced. The entire app is currently on the VPS behind Cloudflare, rather than a separate static Cloudflare frontend. See [deployment notes](docs/deployment.md).

## Local development

Use Node 24, npm and Docker Compose:

```sh
npm ci
docker compose up -d --wait
cp .env.example .env
```

Set a random `BETTER_AUTH_SECRET` in `.env` (for example generate one with `openssl rand -hex 32`). The example database password is local-only. Then:

```sh
npm run db:migrate
npm run dev:api
```

In a second terminal run `npm run dev` and open http://localhost:5173. Vite proxies API/collector requests to localhost:3000. Production serves the built frontend through Hono on the same origin as auth, avoiding cross-site cookies.

Never commit `.env`, a database URL containing real credentials, or the auth secret. Project write keys are public integration identifiers, not account credentials.

## Installation behavior

1. Create an account and project with the exact website origin.
2. Copy the install prompt into the site's coding assistant, or add the script in its shared head.
3. After the script loads, connect the site's analytics consent choice to `window.unfairweekend.consent({ analytics: true })`. Restore a previous consent choice explicitly; do not silently grant consent.
4. Visit the site and grant analytics consent. The dashboard polls for the first receipt; it also offers a manual check.

The tracker sends only a public project key and one installation signal per document. It sends nothing before explicit consent. The collector enforces input bounds, browser-origin matching and a single-instance rate limit; PostgreSQL stores the first receipt and does not overwrite its timestamp on duplicates. A public key or Origin header is not proof of trusted identity, domain ownership, or purchase state. Reload and grant consent again to retry a failed check.

Local projects permit localhost only when `ALLOW_LOCAL_SITES=true`; production leaves it unset. Analytics consent is separate from replay or email permission.

## What is and is not complete

Implemented: password authentication using Better Auth, server-backed sessions, per-account project isolation, persistent projects, copy actions, guide, consent-gated installation receipt, VPS deployment and HTTPS access.

Not implemented: email verification/password recovery, team invitations/shared workspaces, full semantic analytics or SPA navigation events, rrweb replay, signed visitor identity, Firecrawl import, ClickHouse projection, jobs, opportunities or sending. Account email is not treated as verified customer identity. Accounts own separate projects; sharing a repository does not grant project access to another account. Do not describe the installation receipt as complete product onboarding or collected session analytics.

## Checks

```sh
npm run check
npm run build
npm audit --omit=dev
npm run test:onboarding
```

The smoke test needs a running local app/database, Chrome, and port 5180. Set CHROME_PATH to override the macOS Chrome location. It creates synthetic accounts/projects. It tests registration, cross-browser login, logout, per-account isolation, project persistence, clipboard, guide, origin/size rejection, consent gating, a real database receipt, duplicates, mobile overflow and browser errors.

For deployment verification set APP_URL to the public app URL and DEMO_ORIGIN to `https://owned-demo.example`. The test intercepts only that synthetic website document in the browser; auth, script loading and event collection go to the actual deployed app. It does not claim installation on an independently hosted customer site. Test account emails are in example.com; do not use real personal data.

Local and live VPS smoke tests passed on 12 November 2026. Dependency audit passes after pinning the transitive esbuild helper to 0.25.12. Migration and browser tests were rerun after that update.

## Planning sources

The sibling `followup-project-v0.2` handbook (currently revision 0.4), especially chapters 02–04, 08–10, 13, 17–19 and 26–27, supplies the broader requirements. This is the first installation/auth slice, not completion of that backlog. Inter's license is retained in public/fonts. UI reference: the existing kit's brand/BRAND-DNA.md. Installation UX reference: https://visitors.now/docs/installation.
