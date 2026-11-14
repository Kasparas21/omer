/* Public OpenAPI for the stable REST surface (same routes MCP wraps). Served at GET /openapi.json. */
import { appURL } from './auth';

const ISSUER = appURL.replace(/\/$/, '');

const bearer = [{ bearerAuth: [] }];
const projectId = {
  name: 'projectId',
  in: 'path' as const,
  required: true,
  schema: { type: 'string', format: 'uuid' },
  description: 'Store (project) id from GET /api/projects?view=summary.',
};
const json = (schema: Record<string, unknown>) => ({ content: { 'application/json': { schema } } });
const err = json({ type: 'object', properties: { error: { type: 'string' } }, required: ['error'] });

export const OPENAPI = {
  openapi: '3.1.0',
  info: {
    title: 'Omer API',
    version: '1.0.0',
    description:
      'REST API for Omer stores. Authenticate with a personal API key (`omk_…`) from Settings → Integrations → API, '
      + 'or an OAuth access token from Claude / ChatGPT. Keys act as the signed-in owner. '
      + 'Sending email and running campaigns delivers real messages — confirm drafts first. '
      + 'MCP tools at `/mcp` call these same routes.',
  },
  servers: [{ url: ISSUER, description: 'This Omer deployment' }],
  tags: [
    { name: 'Stores', description: 'List and manage stores (projects).' },
    { name: 'Analytics', description: 'Dashboard, usage, and live visitors.' },
    { name: 'People', description: 'Visitor profiles and AI insight.' },
    { name: 'Opportunities', description: 'Personal follow-up queue: list, draft, send.' },
    { name: 'Campaigns', description: 'Campaigns and personal follow-ups.' },
    { name: 'Brand', description: 'Brand knowledge used when drafting email.' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'omk_',
        description: 'Personal API key from Settings → Integrations → API (`omk_…`).',
      },
    },
  },
  paths: {
    '/api/projects': {
      get: {
        tags: ['Stores', 'Analytics'],
        summary: 'List stores or get a dashboard',
        description: 'With `view=summary`, returns every store and its id. With `project=<uuid>`, returns the analytics dashboard for that store.',
        security: bearer,
        parameters: [
          { name: 'view', in: 'query', schema: { type: 'string', enum: ['summary'] } },
          { name: 'project', in: 'query', schema: { type: 'string', format: 'uuid' }, description: 'Store id for the full dashboard snapshot.' },
        ],
        responses: { '200': { description: 'Summary list or dashboard JSON' }, '401': { description: 'Unauthorized', ...err } },
      },
      post: {
        tags: ['Stores'],
        summary: 'Create a store',
        security: bearer,
        requestBody: json({
          type: 'object',
          required: ['name', 'website'],
          properties: {
            name: { type: 'string', maxLength: 80 },
            website: { type: 'string', example: 'https://example.com' },
          },
        }),
        responses: { '200': { description: 'Created project (includes write key)' }, '401': { description: 'Unauthorized', ...err } },
      },
    },
    '/api/projects/{projectId}': {
      parameters: [projectId],
      patch: {
        tags: ['Stores'],
        summary: 'Update store settings',
        security: bearer,
        requestBody: json({
          type: 'object',
          properties: {
            name: { type: 'string', maxLength: 80 },
            displayCurrency: { type: 'string', description: 'ISO currency or "auto".' },
          },
        }),
        responses: { '200': { description: 'Updated project' }, '401': { description: 'Unauthorized', ...err } },
      },
    },
    '/api/projects/{projectId}/usage': {
      parameters: [projectId],
      get: {
        tags: ['Analytics'],
        summary: 'Monthly usage',
        security: bearer,
        responses: { '200': { description: 'Usage counters and daily series' }, '401': { description: 'Unauthorized', ...err } },
      },
    },
    '/api/projects/{projectId}/live': {
      parameters: [projectId],
      get: {
        tags: ['Analytics'],
        summary: 'Live and recent visitors',
        security: bearer,
        responses: { '200': { description: 'Active and recent visits' }, '401': { description: 'Unauthorized', ...err } },
      },
    },
    '/api/projects/{projectId}/visitors/{visitorId}': {
      parameters: [
        projectId,
        { name: 'visitorId', in: 'path', required: true, schema: { type: 'string' }, description: 'Visitor id from live activity, dashboard, or an opportunity.' },
      ],
      get: {
        tags: ['People'],
        summary: 'Visitor profile',
        security: bearer,
        responses: { '200': { description: 'Identity, sessions, purchases, emails, replays' }, '401': { description: 'Unauthorized', ...err } },
      },
    },
    '/api/projects/{projectId}/visitors/{visitorId}/insight': {
      parameters: [
        projectId,
        { name: 'visitorId', in: 'path', required: true, schema: { type: 'string' } },
      ],
      post: {
        tags: ['People'],
        summary: 'Analyze a visitor with AI',
        description: 'Uses AI credits; result is saved on the profile.',
        security: bearer,
        responses: { '200': { description: 'Insight payload' }, '401': { description: 'Unauthorized', ...err } },
      },
    },
    '/api/projects/{projectId}/visitors/{visitorId}/email-context': {
      parameters: [
        projectId,
        { name: 'visitorId', in: 'path', required: true, schema: { type: 'string' } },
      ],
      get: {
        tags: ['People'],
        summary: 'Email context for a visitor',
        security: bearer,
        responses: { '200': { description: 'Facts for drafting an email' }, '401': { description: 'Unauthorized', ...err } },
      },
    },
    '/api/projects/{projectId}/opportunities': {
      parameters: [projectId],
      get: {
        tags: ['Opportunities'],
        summary: 'List follow-up opportunities',
        security: bearer,
        responses: { '200': { description: 'Opportunity queue' }, '401': { description: 'Unauthorized', ...err } },
      },
    },
    '/api/projects/{projectId}/opportunities/{opportunityId}/draft': {
      parameters: [
        projectId,
        { name: 'opportunityId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      post: {
        tags: ['Opportunities'],
        summary: 'Draft a follow-up email with AI',
        description: 'Saves a draft; does not send.',
        security: bearer,
        responses: { '200': { description: 'Draft and page style' }, '401': { description: 'Unauthorized', ...err } },
      },
      put: {
        tags: ['Opportunities'],
        summary: 'Save an edited draft',
        description: 'Does not send.',
        security: bearer,
        requestBody: json({
          type: 'object',
          required: ['draft', 'page'],
          properties: { draft: { type: 'object' }, page: { type: 'object' } },
        }),
        responses: { '200': { description: 'Saved draft' }, '401': { description: 'Unauthorized', ...err } },
      },
    },
    '/api/projects/{projectId}/opportunities/{opportunityId}/send': {
      parameters: [
        projectId,
        { name: 'opportunityId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      post: {
        tags: ['Opportunities'],
        summary: 'Send the saved draft',
        description: 'DELIVERS a real email. Irreversible.',
        security: bearer,
        responses: { '200': { description: 'Send result' }, '401': { description: 'Unauthorized', ...err } },
      },
    },
    '/api/projects/{projectId}/campaigns': {
      parameters: [projectId],
      get: {
        tags: ['Campaigns'],
        summary: 'List campaigns',
        security: bearer,
        responses: { '200': { description: 'Campaigns and queue counts' }, '401': { description: 'Unauthorized', ...err } },
      },
    },
    '/api/projects/{projectId}/brand': {
      parameters: [projectId],
      get: {
        tags: ['Brand'],
        summary: 'Get brand knowledge',
        security: bearer,
        responses: { '200': { description: 'Brand object' }, '401': { description: 'Unauthorized', ...err } },
      },
      put: {
        tags: ['Brand'],
        summary: 'Replace brand knowledge',
        description: 'Send the complete brand object; omitted fields reset.',
        security: bearer,
        requestBody: json({ type: 'object', required: ['brand'], properties: { brand: { type: 'object' } } }),
        responses: { '200': { description: 'Updated brand' }, '401': { description: 'Unauthorized', ...err } },
      },
    },
  },
} as const;

/** Short markdown guide (also at docs/api.md in the repo). */
export const API_MARKDOWN = `# Omer API

Authenticate every request with a personal API key from **Settings → Integrations → API**:

\`\`\`http
Authorization: Bearer omk_…
\`\`\`

Base URL: \`${ISSUER}\`

OpenAPI: [\`/openapi.json\`](${ISSUER}/openapi.json) · MCP (Claude / ChatGPT / Cursor): [\`/mcp\`](${ISSUER}/mcp)

## Quick start

1. Create an API key in Settings.
2. List stores and copy a project id:

\`\`\`bash
curl -sS -H "Authorization: Bearer omk_…" \\
  "${ISSUER}/api/projects?view=summary"
\`\`\`

3. Use that id on everything else:

\`\`\`bash
# Dashboard
curl -sS -H "Authorization: Bearer $OMER_KEY" \\
  "${ISSUER}/api/projects?project=PROJECT_ID"

# Opportunities (people worth a personal email)
curl -sS -H "Authorization: Bearer $OMER_KEY" \\
  "${ISSUER}/api/projects/PROJECT_ID/opportunities"

# Draft a follow-up (does not send)
curl -sS -X POST -H "Authorization: Bearer $OMER_KEY" \\
  "${ISSUER}/api/projects/PROJECT_ID/opportunities/OPPORTUNITY_ID/draft"
\`\`\`

## Safety

\`POST …/send\` and campaign run endpoints deliver **real email**. Draft and review first.

Keys have the same power as the signed-in owner. Revoke unused keys in Settings.
`;
