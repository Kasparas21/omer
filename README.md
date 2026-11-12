# Omer — first onboarding slice

Project creation, a project-specific tracking script/install prompt, an installation guide, and a server-confirmed first-event state. The interface follows the existing Unfair Weekend visual system: Inter, light surfaces, cobalt actions, ghost mark and compact dark dock.

## Run locally

Use Node 24 and Docker Compose. Install dependencies with `npm ci`, then:

```sh
docker compose up -d --wait
cp .dev.vars.example .dev.vars
DATABASE_URL=postgres://unfairweekend:local-only@127.0.0.1:5432/unfairweekend npm run db:migrate
npm run dev
```

Open the local URL printed by Vite. `.dev.vars` is ignored by Git. The credentials in the example are for the loopback-only local database, never production. If you use another PostgreSQL instance, update both the migration environment variable and `.dev.vars`.

Create a project with the exact website origin. HTTPS is required except for localhost/127.0.0.1 when `ALLOW_LOCAL_SITES=true`. The copied script uses the dashboard's origin; a localhost script URL is only usable locally. Production must have a stable HTTPS deployment first.

Paste the generated script into the site's shared head. Wire its consent API to the site's analytics choice after the script loads:

```js
window.unfairweekend.consent({ analytics: true });
```

The tracker sends nothing before this call. It sends one installation signal per document, containing only the public project key. Granting consent must be an actual visitor choice, including a previously saved choice. Reload and grant consent again to retry a failed installation check. The first receipt is stored in PostgreSQL and repeated receipts do not replace its timestamp. This is an installation check, not a full analytics SDK.

## Architecture and scope

- React/Vite frontend; Cloudflare Worker API; Drizzle with the stable `pg` driver; PostgreSQL.
- Worker API uses a random HttpOnly browser cookie, hashed in storage, to scope prototype projects. This is **not account authentication or team membership**. Clearing the cookie loses access, and another browser cannot share projects. Add authenticated workspaces/membership before a public multi-user launch.
- The collector bounds input size, restricts browser origins and rate limits requests. Public keys and origin headers are not proof of domain ownership or trustworthy identity. A received signal cannot authorize email.
- The scope is project creation → installation → first receipt. Replay, behavioral sessions, identity linkage, brand import and email sending are not implemented or represented as ready.
- The v0.2 folder's handbook is now revision 0.4. Its consent, trust-boundary and honest-readiness requirements inform this slice. Cloudflare Workers follows the later hosting direction in the conversation; the handbook's Bun/container runtime remains a separate proposed architecture. TanStack/tRPC, background jobs and ClickHouse are deferred until their corresponding screens/pipelines exist.

Source layout: `src/` dashboard and prompt; `public/tracker.js` browser SDK; `worker/` API and database schema; `drizzle/` versioned migration. Never install the Visitors reference script/token into this product.

## Verification

```sh
npm run check
npm run build
npm audit --omit=dev
```

The browser smoke test requires a running local app/database, a free local port 5180 and Google Chrome:

```sh
npm run test:onboarding
```

Set `CHROME_PATH` to override the macOS Chrome default, or `APP_URL` to change the local app URL. It creates one isolated demo project per run. It checks creation, reload persistence, clipboard content, the guide, independent-browser isolation, rejected origins/oversized input, no collection before consent, a real browser receipt, duplicate receipt stability, mobile overflow and browser errors. Use an isolated database; it does not clean up the created project.

Runtime dependency audit passed. The full audit currently reports four moderate development-tool findings through Drizzle Kit’s transitive esbuild tooling. No forced downgrade was applied; keep migration tooling local and review its upstream fix before exposing development tools.

## Deployment next step

No live deployment or VPS database migration has been performed for this slice. Configure the existing private VPS PostgreSQL connection using a Cloudflare Hyperdrive binding named `HYPERDRIVE` (and the private connection/Tunnel setup), apply the migration through authorized private access, and deploy the built Worker/assets to a stable HTTPS origin. Do not expose PostgreSQL publicly to make the browser connect. Disable `ALLOW_LOCAL_SITES` outside local development. Resolve account/workspace access before exposing dashboard project management publicly; the collector and tracker need their own public routes.

Run migrations once as a controlled operation, not on every request. Collaborators use separate SSH keys and shared versioned migrations; database credentials stay in local environment files or secret bindings.

## References

Product requirements: the sibling `followup-project-v0.2` handbook, particularly chapters 02–04, 08–10, 13, 17, 21 and 26–27. Visual reference: the existing UI kit's `brand/BRAND-DNA.md`. Installation UX reference: https://visitors.now/docs/installation. No competitor implementation code was copied. Inter's license is retained under `public/fonts/`.
