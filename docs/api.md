# Omer API

Call Omer with a personal API key from **Settings → Integrations → API**.

```http
Authorization: Bearer omk_…
```

Polished guide: [`/docs/api`](https://app.tryomer.com/docs/api) · Markdown: this file · Machine schema: [`/openapi.json`](https://app.tryomer.com/openapi.json)

Base URL: your Omer origin (e.g. `https://app.tryomer.com`).

## Quick start

1. Create an API key in Settings (shown once).
2. List stores for a **project id**:

```bash
curl -sS -H "Authorization: Bearer omk_…" \
  "https://app.tryomer.com/api/projects?view=summary"
```

3. Use that id:

```bash
export OMER_KEY=omk_…
export PROJECT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

curl -sS -H "Authorization: Bearer $OMER_KEY" \
  "https://app.tryomer.com/api/projects?project=$PROJECT_ID"

curl -sS -H "Authorization: Bearer $OMER_KEY" \
  "https://app.tryomer.com/api/projects/$PROJECT_ID/opportunities"

curl -sS -X POST -H "Authorization: Bearer $OMER_KEY" \
  "https://app.tryomer.com/api/projects/$PROJECT_ID/opportunities/$OPPORTUNITY_ID/draft"
```

## Useful routes

| Method | Path | What it does |
|--------|------|----------------|
| GET | `/api/projects?view=summary` | Stores + ids |
| GET | `/api/projects?project={id}` | Full dashboard |
| GET | `/api/projects/{id}/live` | Live / recent visitors |
| GET | `/api/projects/{id}/visitors/{visitorId}` | Person profile |
| GET | `/api/projects/{id}/opportunities` | Follow-up queue |
| POST | `/api/projects/{id}/opportunities/{oid}/draft` | AI draft (no send) |
| POST | `/api/projects/{id}/opportunities/{oid}/send` | **Sends** email |
| GET | `/api/projects/{id}/campaigns` | Campaigns |
| GET/PUT | `/api/projects/{id}/brand` | Brand knowledge |

MCP for Claude / ChatGPT / Cursor: `POST /mcp` (see [mcp.md](./mcp.md)).

## Safety

`POST …/send` and campaign runs deliver **real email**. Draft first. Keys act as the owner.

## Errors

Failed calls return `{ "error": "…" }` with a 4xx/5xx status.
