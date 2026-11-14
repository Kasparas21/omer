# MCP: Omer for Claude, ChatGPT and Cursor

Omer runs a remote MCP server at `${APP_URL}/mcp` (Streamable HTTP, stateless JSON-RPC). Every tool wraps the
same REST route the dashboard uses and runs as the signed-in owner, so an AI can do exactly what its owner can.

| File | What it does |
|------|--------------|
| `server/mcp.ts` | `/mcp` endpoint, OAuth discovery + dynamic client registration + authorize + token, key management for Settings |
| `server/mcp-tools.ts` | The 37 tools (analytics, people, replays, brand, opportunities, drafting and sending, campaigns, sending setup, integrations) |
| `server/mcp-auth.ts` | API keys and OAuth tokens (SHA-256 hashed at rest), PKCE codes, refresh rotation |
| `src/ConnectAI.tsx` | Settings → Integrations: per-assistant setup steps, API keys, connected apps |
| `drizzle/0021_mcp_access.sql` | `mcp_tokens`, `mcp_oauth_clients`, `mcp_oauth_codes` |

## Auth
- **Claude.ai / Claude Desktop / ChatGPT**: OAuth 2.1 (PKCE, dynamic client registration). The owner signs in to Omer and presses Allow on `/oauth/authorize`. Access tokens last 8 h; refresh tokens 90 days and rotate on use.
- **Cursor / Claude Code / scripts**: a personal API key (`omk_…`, Settings → Integrations) as `Authorization: Bearer …`. Cursor and Claude Code can also use OAuth.
- Bearer tokens also work on the regular `/api/*` routes. Tokens can never create tokens: key management needs a browser session.

## Deploy checklist
1. Run `npm run db:migrate` (migration 0021).
2. `APP_URL` must be the public HTTPS origin (ChatGPT and Claude.ai call it from their servers). The reverse proxy must pass `/mcp`, `/oauth/*` and `/.well-known/*` to the app.

## Safety
Tools that email real customers (`send_opportunity_email`, `run_campaigns`, auto-mode campaigns, `set_personal_followups`) are annotated destructive, so clients ask for confirmation, and the server instructions tell the model to show drafts and get explicit approval first.
