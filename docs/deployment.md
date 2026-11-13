# VPS deployment · app.tryomer.com

Production: **https://app.tryomer.com** via the named Cloudflare Tunnel to the Hostinger VPS. The permanent hostname passed the onboarding smoke test against VPS PostgreSQL. Use this hostname for sign-in and new tracker snippets. Replace any old Quick Tunnel URLs in installed scripts before retiring the temporary connector.

Host: Hostinger VPS. Release sources live under `/opt/omer/releases/`. Containers: `omer-app`, `omer-tunnel-named` (permanent connector), and existing `unfairweekend-db-postgres-1`. Database: `omer`; schema/migration owner: `omer_owner`; runtime role: `omer_app`. App listens only on `127.0.0.1:3000`; PostgreSQL only on `127.0.0.1:5432`. Cloudflare Tunnel makes outbound connections; no public database port is opened.

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

6. On the VPS, run the named connector in a separate container with host networking and a restart policy. Mount only its tunnel JSON and config read-only; keep the account-level `cert.pem` on the Mac. Verify the named hostname before retiring the temporary connector.
7. Set `APP_URL=https://app.tryomer.com` in both env files, rebuild/recreate `omer-app`, then verify `curl --fail https://app.tryomer.com/health`.

Tracker snippets use `APP_URL` / the page origin. After the hostname change, re-copy install scripts for any demo sites.

`cdn.tryomer.com` can host `tracker.js` later (Visitors-style CDN). Not required now: the script is served from the same app origin.

## Session replay (Cloudflare R2)

Replay chunks are private objects. Postgres only stores manifests. Add these to `/opt/omer/runtime.env` (and keep secrets out of git):

```sh
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=omer-replays
# optional if not using the default account endpoint:
# R2_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
# R2_REGION=auto
```

Create the bucket with `npx wrangler r2 bucket create omer-replays`, then an R2 API token with Object Read & Write on that bucket. Until these vars are present, Settings shows “Storage not configured” and replay stays off. Raw recordings expire after 7 days.

## Replay AI summaries (OpenAI)

Session replay summaries use the OpenAI Platform Decisions API and Responses API (`gpt-6-luna`). Add one secret to `/opt/omer/runtime.env` (and local `.env`):

```sh
OPENAI_API_KEY=sk-...
```

Create the key at https://platform.openai.com/api-keys. Until it is present, `/api/config` reports `replayInsights: false` and the summary panel stays hidden; playback still works. After adding the key, recreate `omer-app` and apply migration `0008_replay_insights` if it has not run yet.

## Update app image

Create a release archive with `git archive` from the reviewed commit. Extract it under `/opt/omer/releases/<release>` on the VPS so only committed source is deployed. Keep env files outside that directory. Build before stopping the running app:

```sh
cd /opt/omer/releases/<release>
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

The public tracker is served with `no-store` so the same URL can pick up collector fixes.
The install snippet includes a version query to bypass older copies cached before that
policy. When moving from a release that cached the bare URL, purge only
`https://app.tryomer.com/tracker.js` in Cloudflare. Browsers still holding the old
response need to revalidate it or load the versioned snippet. Verify by granting
analytics consent in a fresh browser and checking for a successful
`POST /v1/collect/event`, not just the legacy install receipt.

Live uses one authenticated event stream per active project and refreshes the shared
snapshot after a recorded page view. It falls back to polling when the stream is
unavailable. Visible consented tabs send a presence signal that does not increase
page-view counts; visitors age out after five minutes without activity.
