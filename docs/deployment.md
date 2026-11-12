# VPS deployment · app.tryomer.com

Target production hostname: **https://app.tryomer.com** via a named Cloudflare Tunnel to the Hostinger VPS. The earlier temporary `trycloudflare.com` Quick Tunnel is only for throwaway demos.

Host: Hostinger VPS. Source at `/opt/omer/app`. Containers: `omer-app`, `omer-tunnel` (named tunnel), and existing `unfairweekend-db-postgres-1`. Database: `omer`; schema/migration owner: `omer_owner`; runtime role: `omer_app`. App listens only on `127.0.0.1:3000`; PostgreSQL only on `127.0.0.1:5432`. Cloudflare Tunnel makes outbound connections; no public database port is opened.

Secrets live in mode-600 `/opt/omer/runtime.env` and `/opt/omer/migration.env` inside a root-only directory. Never paste these into chat or Git.

## Runtime env (paste Google here)

`/opt/omer/runtime.env` (and migration env for `APP_URL` / `DATABASE_URL`) should include:

```env
DATABASE_URL=postgres://omer_app:...@127.0.0.1:5432/omer
APP_URL=https://app.tryomer.com
BETTER_AUTH_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

Leave `GOOGLE_*` empty until the OAuth client exists; email/password still works. After pasting Google credentials, recreate `omer-app` so the process picks them up.

### Google Cloud OAuth

Create a Web application OAuth 2.0 client. Authorized redirect URIs:

- `http://localhost:5173/api/auth/callback/google` (local Vite)
- `https://app.tryomer.com/api/auth/callback/google` (production)

Authorized JavaScript origins (if the console asks):

- `http://localhost:5173`
- `https://app.tryomer.com`

Local paste location: project `.env` (gitignored), same variable names as `.env.example`.

## Named Cloudflare Tunnel

On a machine with Cloudflare access (this Mac or the VPS):

1. Install `cloudflared` if missing (`brew install cloudflare/cloudflare/cloudflared`).
2. `cloudflared tunnel login` (select the `tryomer.com` zone).
3. `cloudflared tunnel create omer-app`.
4. Route DNS: `cloudflared tunnel route dns omer-app app.tryomer.com` (creates the `app` CNAME).
5. Config (example) pointing at the loopback app:

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /root/.cloudflared/<TUNNEL_ID>.json
ingress:
  - hostname: app.tryomer.com
    service: http://127.0.0.1:3000
  - service: http_status:404
```

6. Run the tunnel as the `omer-tunnel` container or a host service with restart policy. Stop any Quick Tunnel container so hostnames do not fight.
7. Set `APP_URL=https://app.tryomer.com` in both env files, rebuild/recreate `omer-app`, then verify `curl --fail https://app.tryomer.com/health`.

Tracker snippets use `APP_URL` / the page origin. After the hostname change, re-copy install scripts for any demo sites.

`cdn.tryomer.com` can host `tracker.js` later (Visitors-style CDN). Not required now: the script is served from the same app origin.

## Update app image

Upload reviewed source without `.git`, `.env*`, `.dev.vars*`, `node_modules` or build artifacts into `/opt/omer/app`. Keep env files outside the source directory. Build before stopping the running app:

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

Apply reviewed migrations once, not on every app startup. Auth migrations use the pinned Better Auth package's migration API; project migrations live in `drizzle/`.

## Verification and limits

Check health through `https://app.tryomer.com`, then run the browser smoke test from the README with `APP_URL=https://app.tryomer.com`. Google sign-in is covered manually after credentials are pasted (the smoke test keeps the email/password path).

Production email verification/recovery and team membership are still pending. Database backup/restore must be established before real customer use.

Source references: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/ and https://www.better-auth.com/docs/authentication/google
