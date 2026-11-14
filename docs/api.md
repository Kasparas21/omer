# Omer API

Authenticate every request with a personal API key from **Settings → Integrations → API**:

```http
Authorization: Bearer omk_…
```

Base URL: your Omer origin (e.g. `https://app.tryomer.com`).

- OpenAPI: `GET /openapi.json`
- Human guide (same content): `GET /docs/api.md`
- MCP for Claude / ChatGPT / Cursor: `POST /mcp` (see [mcp.md](./mcp.md))

Bearer tokens also work on the same `/api/*` routes the dashboard uses. Keys cannot create other keys.

## Quick start

1. Create an API key in Settings → Integrations → API (shown once).
2. List stores and copy a **project id**:

```bash
curl -sS -H "Authorization: Bearer omk_…" \
  "https://app.tryomer.com/api/projects?view=summary"
```

3. Use that id:

```bash
export OMER_KEY=omk_…
export PROJECT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Analytics dashboard
curl -sS -H "Authorization: Bearer $OMER_KEY" \
  "https://app.tryomer.com/api/projects?project=$PROJECT_ID"

# Live visitors
curl -sS -H "Authorization: Bearer $OMER_KEY" \
  "https://app.tryomer.com/api/projects/$PROJECT_ID/live"

# Opportunities (personal follow-up queue)
curl -sS -H "Authorization: Bearer $OMER_KEY" \
  "https://app.tryomer.com/api/projects/$PROJECT_ID/opportunities"

# Draft a follow-up email (does not send)
curl -sS -X POST -H "Authorization: Bearer $OMER_KEY" \
  "https://app.tryomer.com/api/projects/$PROJECT_ID/opportunities/$OPPORTUNITY_ID/draft"
```

## Useful routes

| Method | Path | What it does |
|--------|------|----------------|
| GET | `/api/projects?view=summary` | Stores + ids |
| GET | `/api/projects?project={id}` | Full dashboard |
| GET | `/api/projects/{id}/usage` | Monthly usage |
| GET | `/api/projects/{id}/live` | Live / recent visitors |
| GET | `/api/projects/{id}/visitors/{visitorId}` | Person profile |
| POST | `/api/projects/{id}/visitors/{visitorId}/insight` | AI analysis |
| GET | `/api/projects/{id}/opportunities` | Follow-up queue |
| POST | `/api/projects/{id}/opportunities/{oid}/draft` | AI draft (no send) |
| POST | `/api/projects/{id}/opportunities/{oid}/send` | **Sends** email |
| GET | `/api/projects/{id}/campaigns` | Campaigns |
| GET/PUT | `/api/projects/{id}/brand` | Brand knowledge |

Full path list for agents: `/openapi.json`. MCP tool names map 1:1 onto these routes (see `server/mcp-tools.ts`).

## Safety

`POST …/send` and campaign run endpoints deliver **real email**. Draft and review first.

Keys act as the owner. Revoke unused keys in Settings.

## Errors

Failed calls return JSON `{ "error": "…" }` with a 4xx/5xx status.
