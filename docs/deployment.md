# VPS demo deployment

Current temporary demo: https://commission-big-gathered-activation.trycloudflare.com (verified 12 November 2026). The current image is `omer:auth-onboarding-fixed`. Tunnel metrics bind to 127.0.0.1:20242.

Host: the existing Hostinger VPS. Source is installed at `/opt/omer/app`. Containers: `omer-app`, `omer-tunnel`, and existing `unfairweekend-db-postgres-1`. Database: `omer`; schema/migration owner: `omer_owner`; runtime role: `omer_app`. App listens only on 127.0.0.1:3000; PostgreSQL only on 127.0.0.1:5432. Cloudflare tunnel makes outbound connections; no public database port is opened.

Secrets are generated on the VPS and stored in mode-600 `/opt/omer/runtime.env` and `/opt/omer/migration.env`, inside a root-only directory. Never paste these into chat or Git. The runtime role has table DML and sequence permissions, not superuser/role creation/schema ownership. The migration role is used only for migrations. Better Auth uses hashed passwords and server-backed sessions. Production cookies are Secure/HttpOnly under the HTTPS APP_URL.

## Update

Upload reviewed source without `.git`, `.env*`, `.dev.vars*`, node_modules or build artifacts into `/opt/omer/app`. Keep the env files outside the source directory. Build before stopping the running app:

```sh
cd /opt/omer/app
docker build -t omer:next .
docker run --rm --network host --env-file /opt/omer/migration.env omer:next npx tsx server/migrate.ts
```

After checking migration success, preserve the previous image for rollback and replace only the app container:

```sh
docker stop omer-app
docker rm omer-app
docker run -d --name omer-app --network host --restart unless-stopped \
  --env-file /opt/omer/runtime.env --cap-drop ALL --security-opt no-new-privileges omer:next
curl --fail http://127.0.0.1:3000/health
```

Apply reviewed migrations once, not on every app startup. Existing default privileges give omer_app DML access to new public tables created by omer_owner. Auth migrations use the pinned Better Auth package's migration API; project migrations live in `drizzle/`. Review generated schema changes before future upgrades.

## Temporary Cloudflare URL

The tunnel container runs cloudflared against http://127.0.0.1:3000 and restarts unless stopped. It has no account/domain requirement. Its lifetime URL is visible in `docker logs omer-tunnel`; do not restart it casually. If it restarts, update APP_URL in both server env files and recreate the app container. Previously copied tracker snippets must then use the new hostname; cookies from the previous hostname do not transfer, so sign in again. Persistent accounts/projects stay in PostgreSQL.

Cloudflare Quick Tunnels are test/development infrastructure with no permanent-hostname promise. For a stable launch, configure a named tunnel using a controlled domain such as app.tryomer.com, update APP_URL, redeploy, and retest. Free workers.dev hosting alone does not provide a permanent private route to this VPS; the two pieces must be configured deliberately.

## Verification and limits

Check health through the public hostname, then run the browser smoke test from README. It verifies real VPS auth and PostgreSQL persistence using synthetic test accounts and an intercepted owned demo page. No live customer site, replay pipeline, sending workflow, load test, restore rehearsal or complete security audit is implied.

Production email verification/recovery and team membership are still pending. Keep this deployment as the bounded hackathon demo. Container restarts are configured; the tunnel's temporary hostname remains the availability limitation. Database backup/restore operations must be established before real customer use.

Source references: https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/ and https://better-auth.com/docs/adapters/postgresql.
