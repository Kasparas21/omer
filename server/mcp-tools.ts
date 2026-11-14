/* The tools Claude, Cursor and ChatGPT get. Every tool is a thin wrapper over the same REST route the
   dashboard uses, called with the caller's own token, so what an AI can see and do is exactly what the
   signed-in owner can: same ownership checks, same validation, same limits. Nothing here touches the
   database directly. */

export type Caller = (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown) => Promise<{ status: number; data: unknown }>;

type Schema = Record<string, unknown>;
export type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Schema;
  annotations: { readOnlyHint: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean };
  run: (args: Record<string, unknown>, call: Caller) => Promise<{ status: number; data: unknown }>;
};

const UUID = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
const str = (description: string, extra: Schema = {}) => ({ type: 'string', description, ...extra });
const projectId = str('The store (project) id. Call list_projects first to find it.', { pattern: UUID });
const obj = (properties: Schema, required: string[] = []): Schema => ({ type: 'object', properties, required, additionalProperties: false });
const uuidArg = (description: string) => str(description, { pattern: UUID });

class ArgError extends Error {}
const text = (args: Record<string, unknown>, key: string) => {
  const v = args[key];
  if (typeof v !== 'string' || !v.trim()) throw new ArgError(`${key} is required.`);
  return v.trim();
};
const id = (args: Record<string, unknown>, key: string) => encodeURIComponent(text(args, key));
const optional = (args: Record<string, unknown>, key: string) => (args[key] === undefined ? undefined : args[key]);
const pid = (args: Record<string, unknown>) => id(args, 'project_id');
const base = (args: Record<string, unknown>) => `/api/projects/${pid(args)}`;

type Def = Omit<Tool, 'annotations'> & { annotations?: Partial<Tool['annotations']> };
const read = (t: Def): Tool => ({ ...t, annotations: { readOnlyHint: true, ...t.annotations } });
const write = (t: Def): Tool => ({ ...t, annotations: { readOnlyHint: false, destructiveHint: false, ...t.annotations } });

const OPPORTUNITY_STATUSES = ['review', 'hold', 'dismissed', 'ready_for_draft', 'drafted', 'sent'];
const PROVIDER = { type: 'string', enum: ['stripe', 'dodo', 'revenuecat'], description: 'Revenue provider.' };

export const INSTRUCTIONS = `Omer is behavior-based lifecycle email. It watches what each visitor does on a store (pages, cart, replays, purchases), finds "opportunities" (people worth emailing), drafts personal follow-ups in the store's brand voice, and runs automated campaigns.

How to work with it:
1. Call list_projects to get the store (project) id every other tool needs.
2. To understand a store: get_project_dashboard (traffic, revenue, sources, products, campaigns), get_live_activity, get_brand_knowledge.
3. To understand a person: list_opportunities → get_visitor_profile / get_visitor_email_context → analyze_visitor (AI read of their sessions) → get_replay / summarize_replay.
4. To email a person: draft_opportunity_email (AI draft in the store's voice) → optionally edit and save_opportunity_draft → send_opportunity_email. Sending delivers a REAL email to a real customer: show the user the draft and get their explicit OK first.
5. To automate: get_campaign_options and preview_campaign_trigger to see who a rule would reach, then save_campaign. list_campaign_suggestions shows ideas Omer found in the data.
6. Setup: get_sending_settings / update_sending_settings / check_sending_domain for the From address and domain; list_integrations and connect_integration for Stripe, Dodo Payments and RevenueCat.

Tools return JSON. Ids are UUIDs. Never invent ids; read them from earlier results.`;

export const TOOLS: Tool[] = [
  // ---------- Stores and analytics
  read({
    name: 'list_projects',
    title: 'List stores',
    description: 'List every store (project) on this account with its id, name, website, display currency, whether tracking has started, and whether session replay is on. Always the first call: all other tools need a project_id from here.',
    inputSchema: obj({}),
    run: (_a, call) => call('GET', '/api/projects?view=summary'),
  }),
  read({
    name: 'get_project_dashboard',
    title: 'Get store dashboard',
    description: 'The full analytics snapshot for one store: visitors, page views, top pages, referrers and traffic sources, countries, dwell time, purchases and revenue (last 30-60 days by day), revenue by source / page / campaign / product, email opens and clicks, and recent people. The best single call to understand how a store is doing.',
    inputSchema: obj({ project_id: projectId }, ['project_id']),
    run: (a, call) => call('GET', `/api/projects?project=${pid(a)}`),
  }),
  read({
    name: 'get_usage',
    title: 'Get monthly usage',
    description: 'This month\'s tracked usage for a store: page views, purchases, identified people, email opens and clicks, with a per-day page view series.',
    inputSchema: obj({ project_id: projectId }, ['project_id']),
    run: (a, call) => call('GET', `${base(a)}/usage`),
  }),
  read({
    name: 'get_live_activity',
    title: 'Get live visitors',
    description: 'Who is on the store right now and in the last 24 hours: each visit with page, referrer, city and country, plus who is active at this moment.',
    inputSchema: obj({ project_id: projectId }, ['project_id']),
    run: (a, call) => call('GET', `${base(a)}/live`),
  }),
  write({
    name: 'create_project',
    title: 'Create a store',
    description: 'Create a new store (project) to track. Returns the project with its write key; the tracker snippet must then be installed on the website.',
    inputSchema: obj({ name: str('Store name, up to 80 characters.'), website: str('Website address, e.g. https://example.com') }, ['name', 'website']),
    run: (a, call) => call('POST', '/api/projects', { name: text(a, 'name'), website: text(a, 'website') }),
  }),
  write({
    name: 'update_project',
    title: 'Update store settings',
    description: 'Rename a store or change its display currency. At least one of name or display_currency.',
    inputSchema: obj({
      project_id: projectId,
      name: str('New store name (max 80 characters).'),
      display_currency: str('Three-letter currency code (usd, eur, gbp …) or "auto" to follow recent purchases.'),
    }, ['project_id']),
    annotations: { idempotentHint: true },
    run: (a, call) => {
      const body: Record<string, unknown> = {};
      if (optional(a, 'name') !== undefined) body.name = a.name;
      if (optional(a, 'display_currency') !== undefined) body.displayCurrency = a.display_currency;
      return call('PATCH', base(a), body);
    },
  }),

  // ---------- People and sessions
  read({
    name: 'get_visitor_profile',
    title: 'Get a person\'s profile',
    description: 'Everything known about one visitor: identity (name, email if captured), sessions with pages, device and location, purchases, cart activity, email history, session replays, and any saved AI insight.',
    inputSchema: obj({ project_id: projectId, visitor_id: str('Visitor id (from the dashboard, live activity or opportunities).') }, ['project_id', 'visitor_id']),
    run: (a, call) => call('GET', `${base(a)}/visitors/${id(a, 'visitor_id')}`),
  }),
  read({
    name: 'get_visitor_email_context',
    title: 'Get email context for a person',
    description: 'The facts an email to this person may use: what they viewed, their cart, products with live price and stock, codes, and past emails. Use before writing or judging an email.',
    inputSchema: obj({ project_id: projectId, visitor_id: str('Visitor id.') }, ['project_id', 'visitor_id']),
    run: (a, call) => call('GET', `${base(a)}/visitors/${id(a, 'visitor_id')}/email-context`),
  }),
  write({
    name: 'analyze_visitor',
    title: 'Analyze a person with AI',
    description: 'Run (or refresh) Omer\'s AI read of a visitor across all their sessions: intent, friction, interests, and whether and how to follow up. Uses AI credits; the result is saved on their profile.',
    inputSchema: obj({ project_id: projectId, visitor_id: str('Visitor id.') }, ['project_id', 'visitor_id']),
    annotations: { idempotentHint: true },
    run: (a, call) => call('POST', `${base(a)}/visitors/${id(a, 'visitor_id')}/insight`),
  }),
  read({
    name: 'get_replay',
    title: 'Get a session replay',
    description: 'Metadata for one session replay: who, when, device, duration, pages, and the saved AI summary if one exists. Replay frames are not returned.',
    inputSchema: obj({ project_id: projectId, replay_id: uuidArg('Replay id (from a visitor profile).') }, ['project_id', 'replay_id']),
    run: (a, call) => call('GET', `${base(a)}/replays/${id(a, 'replay_id')}`),
  }),
  write({
    name: 'summarize_replay',
    title: 'Summarize a session replay with AI',
    description: 'Have AI watch a session replay and describe what the person did, where they struggled, and what they wanted. Uses AI credits; result is saved.',
    inputSchema: obj({ project_id: projectId, replay_id: uuidArg('Replay id.') }, ['project_id', 'replay_id']),
    annotations: { idempotentHint: true },
    run: (a, call) => call('POST', `${base(a)}/replays/${id(a, 'replay_id')}/summary`),
  }),

  // ---------- Brand knowledge
  read({
    name: 'get_brand_knowledge',
    title: 'Get brand knowledge',
    description: 'The store\'s brand knowledge that every email is written from: product information, brand voice guide, colors, fonts, logos, tone, tagline, offers and FAQs.',
    inputSchema: obj({ project_id: projectId }, ['project_id']),
    run: (a, call) => call('GET', `${base(a)}/brand`),
  }),
  write({
    name: 'update_brand_knowledge',
    title: 'Update brand knowledge',
    description: 'Replace the store\'s brand knowledge. Pass the COMPLETE brand object: first call get_brand_knowledge, change what is needed, and send the whole thing back (fields not sent are reset to empty).',
    inputSchema: obj({ project_id: projectId, brand: { type: 'object', description: 'The full brand object, in the same shape get_brand_knowledge returns under "brand".' } }, ['project_id', 'brand']),
    annotations: { idempotentHint: true, destructiveHint: true },
    run: (a, call) => call('PUT', `${base(a)}/brand`, { brand: a.brand }),
  }),
  write({
    name: 'import_brand_from_website',
    title: 'Import brand knowledge from the website',
    description: 'Read the store\'s website and draft Product Information and a Brand Voice Guide from it. Overwrites the imported parts of brand knowledge. Takes up to a minute.',
    inputSchema: obj({ project_id: projectId }, ['project_id']),
    annotations: { destructiveHint: true },
    run: (a, call) => call('POST', `${base(a)}/brand/import`),
  }),

  // ---------- Opportunities: the personal follow-up queue
  read({
    name: 'list_opportunities',
    title: 'List follow-up opportunities',
    description: 'People Omer thinks are worth a personal email: reason, behavior hooks, AI summary, email address if known, status, and the current draft if there is one. Statuses: review, hold, dismissed, ready_for_draft, drafted, sent.',
    inputSchema: obj({ project_id: projectId }, ['project_id']),
    run: (a, call) => call('GET', `${base(a)}/opportunities`),
  }),
  write({
    name: 'update_opportunity_status',
    title: 'Change an opportunity\'s status',
    description: 'Move an opportunity between review, hold, dismissed, ready_for_draft, drafted and sent. Setting "dismissed" removes the person from the queue. This does not send anything.',
    inputSchema: obj({ project_id: projectId, opportunity_id: uuidArg('Opportunity id.'), status: { type: 'string', enum: OPPORTUNITY_STATUSES } }, ['project_id', 'opportunity_id', 'status']),
    annotations: { idempotentHint: true },
    run: (a, call) => call('PATCH', `${base(a)}/opportunities/${id(a, 'opportunity_id')}`, { status: text(a, 'status') }),
  }),
  write({
    name: 'draft_opportunity_email',
    title: 'Draft a follow-up email with AI',
    description: 'Write a personal follow-up email for one opportunity in the store\'s brand voice, using that person\'s real behavior. Saves the draft and returns the email document (subject, preview, body, products, CTA) and page style. Nothing is sent.',
    inputSchema: obj({ project_id: projectId, opportunity_id: uuidArg('Opportunity id.') }, ['project_id', 'opportunity_id']),
    run: (a, call) => call('POST', `${base(a)}/opportunities/${id(a, 'opportunity_id')}/draft`),
  }),
  write({
    name: 'save_opportunity_draft',
    title: 'Save an edited email draft',
    description: 'Save a hand-edited draft for an opportunity. Pass the draft and page objects in the same shape draft_opportunity_email or list_opportunities returned (draft: subject, preview, headline, body[], products[], cta, perks[] …; page: colors, fonts, skin). Nothing is sent.',
    inputSchema: obj({
      project_id: projectId,
      opportunity_id: uuidArg('Opportunity id.'),
      draft: { type: 'object', description: 'The email document.' },
      page: { type: 'object', description: 'The page style.' },
    }, ['project_id', 'opportunity_id', 'draft', 'page']),
    annotations: { idempotentHint: true },
    run: (a, call) => call('PUT', `${base(a)}/opportunities/${id(a, 'opportunity_id')}/draft`, { draft: a.draft, page: a.page }),
  }),
  write({
    name: 'send_opportunity_email',
    title: 'Send the email to the customer',
    description: 'SEND the saved draft to the person right now from the store\'s From address. This delivers a real email to a real customer and cannot be undone. Only call after the user has seen the draft and explicitly approved sending it.',
    inputSchema: obj({ project_id: projectId, opportunity_id: uuidArg('Opportunity id (must already have a draft).') }, ['project_id', 'opportunity_id']),
    annotations: { destructiveHint: true, openWorldHint: true },
    run: (a, call) => call('POST', `${base(a)}/opportunities/${id(a, 'opportunity_id')}/send`),
  }),

  // ---------- Campaigns
  read({
    name: 'list_campaign_suggestions',
    title: 'List campaign ideas',
    description: 'Campaign ideas Omer found in this store\'s data (for example "people who left items in their cart"), with how many people each would reach. Statuses: suggested, accepted, dismissed.',
    inputSchema: obj({ project_id: projectId }, ['project_id']),
    run: (a, call) => call('GET', `${base(a)}/campaign-suggestions`),
  }),
  write({
    name: 'update_campaign_suggestion',
    title: 'Accept or dismiss a campaign idea',
    description: 'Mark a campaign suggestion as accepted, dismissed, or back to suggested.',
    inputSchema: obj({ project_id: projectId, suggestion_id: uuidArg('Suggestion id.'), status: { type: 'string', enum: ['suggested', 'accepted', 'dismissed'] } }, ['project_id', 'suggestion_id', 'status']),
    annotations: { idempotentHint: true },
    run: (a, call) => call('PATCH', `${base(a)}/campaign-suggestions/${id(a, 'suggestion_id')}`, { status: text(a, 'status') }),
  }),
  read({
    name: 'list_campaigns',
    title: 'List campaigns',
    description: 'All of the store\'s campaigns (name, on/off, mode, trigger steps, settings, email) plus how many emails are queued for approval.',
    inputSchema: obj({ project_id: projectId }, ['project_id']),
    run: (a, call) => call('GET', `${base(a)}/campaigns`),
  }),
  read({
    name: 'get_campaign_options',
    title: 'Get campaign trigger options',
    description: 'Real values to build a campaign trigger from: this store\'s pages, sources, countries and products with counts. Use it so step values actually match data.',
    inputSchema: obj({ project_id: projectId }, ['project_id']),
    run: (a, call) => call('GET', `${base(a)}/campaigns/options`),
  }),
  read({
    name: 'preview_campaign_trigger',
    title: 'Preview who a trigger reaches',
    description: `Count and sample the real people a campaign trigger would match, without saving anything. A trigger is {steps:[…], wait}. Each step is {kind, value, match?, times?, within?, gap?}. kind is one of: visited, landed, left, source, country, bought, no_buy, no_return, added_cart, cart_value, near_free_ship, code_failed, compared, sold_out, back_in_stock, price_drop, struggled. "value" is a page path / source / country code / product name (empty = any); match is "is" or "starts" for pages; no_buy and no_return use within (1 hour, 4 hours, 1 day, 3 days, 1 week, 2 weeks, 3 weeks, 30 days, 60 days, 90 days). wait is one of: right away, after 10 minutes, after 1 hour, after 4 hours, after 1 day, after 3 days. Example abandoned cart: {"steps":[{"kind":"added_cart","value":""},{"kind":"no_buy","value":"","within":"1 hour"}],"wait":"right away"}.`,
    inputSchema: obj({ project_id: projectId, trigger: { type: 'object', description: 'The trigger: {steps, wait}.' } }, ['project_id', 'trigger']),
    run: (a, call) => call('POST', `${base(a)}/campaigns/preview`, { trigger: a.trigger }),
  }),
  write({
    name: 'save_campaign',
    title: 'Create or update a campaign',
    description: `Create or replace one campaign. Pass a fresh campaign_id (6-64 letters, digits and hyphens, e.g. "cart-rescue-2026") to create, or an existing id from list_campaigns to replace it. campaign is {name, trigger:{steps,wait} (see preview_campaign_trigger), mode:"review"|"auto", on:boolean, settings:{limit,who,freq,quiet,expires,from}, mail: the email document}. mode "review" queues each email for the owner's approval; "auto" SENDS automatically to everyone who matches once on=true, so default to "review" and keep on=false until the user confirms. When replacing, send the whole campaign as list_campaigns returned it with your changes. If "on" is true it starts matching right away.`,
    inputSchema: obj({
      project_id: projectId,
      campaign_id: str('Campaign id: letters, digits and hyphens, 6-64 characters.', { pattern: '^[A-Za-z0-9][A-Za-z0-9-]{5,63}$' }),
      campaign: { type: 'object', description: 'The campaign object.' },
    }, ['project_id', 'campaign_id', 'campaign']),
    annotations: { idempotentHint: true, destructiveHint: true },
    run: (a, call) => call('PUT', `${base(a)}/campaigns/${id(a, 'campaign_id')}`, { campaign: a.campaign }),
  }),
  write({
    name: 'delete_campaign',
    title: 'Delete a campaign',
    description: 'Permanently delete a campaign. Emails already sent are unaffected.',
    inputSchema: obj({ project_id: projectId, campaign_id: str('Campaign id.') }, ['project_id', 'campaign_id']),
    annotations: { destructiveHint: true, idempotentHint: true },
    run: (a, call) => call('DELETE', `${base(a)}/campaigns/${id(a, 'campaign_id')}`),
  }),
  write({
    name: 'run_campaigns',
    title: 'Run campaigns now',
    description: 'Check every campaign that is on right now and queue (or, for auto campaigns, send) emails for new matches, instead of waiting for the 10-minute schedule. Returns how many were queued.',
    inputSchema: obj({ project_id: projectId }, ['project_id']),
    annotations: { destructiveHint: true, openWorldHint: true },
    run: (a, call) => call('POST', `${base(a)}/campaigns/run`),
  }),
  read({
    name: 'get_personal_followups',
    title: 'Get personal follow-up status',
    description: 'Whether automatic personal follow-ups are on for this store, and the last few that actually went out.',
    inputSchema: obj({ project_id: projectId }, ['project_id']),
    run: (a, call) => call('GET', `${base(a)}/campaigns/personal`),
  }),
  write({
    name: 'set_personal_followups',
    title: 'Turn personal follow-ups on or off',
    description: 'Turn automatic personal follow-ups on or off. When on, Omer drafts and sends high-confidence follow-ups to real customers on its own.',
    inputSchema: obj({ project_id: projectId, on: { type: 'boolean' } }, ['project_id', 'on']),
    annotations: { idempotentHint: true, destructiveHint: true },
    run: (a, call) => call('POST', `${base(a)}/campaigns/personal`, { on: a.on !== false }),
  }),

  // ---------- Sending
  read({
    name: 'get_sending_settings',
    title: 'Get email sending settings',
    description: 'The store\'s From name and address, sending domain, provider (Omer SES, Resend or Postmark), and DNS verification status with the records to add.',
    inputSchema: obj({ project_id: projectId }, ['project_id']),
    run: (a, call) => call('GET', `${base(a)}/sending`),
  }),
  write({
    name: 'update_sending_settings',
    title: 'Update email sending settings',
    description: 'Set the From name, From email, sending domain and provider. For a bring-your-own provider pass provider ("resend" or "postmark") and provider_api_key. start_verify begins domain verification.',
    inputSchema: obj({
      project_id: projectId,
      from_name: str('Display name on emails.'),
      from_email: str('From address.'),
      domain: str('Sending domain, e.g. mail.example.com.'),
      provider: { type: 'string', enum: ['ses', 'resend', 'postmark'] },
      provider_api_key: str('API key for Resend or Postmark (stored encrypted).'),
      clear_provider_key: { type: 'boolean', description: 'Remove the stored provider key.' },
      start_verify: { type: 'boolean', description: 'Start domain verification.' },
    }, ['project_id']),
    annotations: { idempotentHint: true },
    run: (a, call) => call('PUT', `${base(a)}/sending`, {
      fromName: a.from_name, fromEmail: a.from_email, domain: a.domain, provider: a.provider,
      providerApiKey: a.provider_api_key, clearProviderKey: a.clear_provider_key, startVerify: a.start_verify,
    }),
  }),
  write({
    name: 'check_sending_domain',
    title: 'Re-check domain verification',
    description: 'Re-check the sending domain\'s DNS records and update its verification status.',
    inputSchema: obj({ project_id: projectId }, ['project_id']),
    annotations: { idempotentHint: true },
    run: (a, call) => call('POST', `${base(a)}/sending/check`),
  }),

  // ---------- Revenue integrations
  read({
    name: 'list_integrations',
    title: 'List revenue integrations',
    description: 'Stripe, Dodo Payments and RevenueCat connection status for a store: connected or not, account id, last sync, last error. Keys are never returned.',
    inputSchema: obj({ project_id: projectId }, ['project_id']),
    run: (a, call) => call('GET', `${base(a)}/integrations`),
  }),
  write({
    name: 'connect_integration',
    title: 'Connect a revenue provider',
    description: 'Connect Stripe, Dodo Payments or RevenueCat with an API key (stored encrypted, never shown again). Use a restricted/read-only key where the provider offers one.',
    inputSchema: obj({ project_id: projectId, provider: PROVIDER, api_key: str('The provider API key.'), webhook_secret: str('Optional Stripe webhook signing secret.') }, ['project_id', 'provider', 'api_key']),
    run: (a, call) => call('POST', `${base(a)}/integrations/${id(a, 'provider')}/connect`, { apiKey: text(a, 'api_key'), webhookSecret: optional(a, 'webhook_secret') }),
  }),
  write({
    name: 'sync_integration',
    title: 'Sync a revenue provider now',
    description: 'Pull the latest orders and revenue from a connected provider right now.',
    inputSchema: obj({ project_id: projectId, provider: PROVIDER }, ['project_id', 'provider']),
    annotations: { idempotentHint: true },
    run: (a, call) => call('POST', `${base(a)}/integrations/${id(a, 'provider')}/sync`),
  }),
  write({
    name: 'disconnect_integration',
    title: 'Disconnect a revenue provider',
    description: 'Disconnect a provider and delete its stored key. Already-imported orders stay.',
    inputSchema: obj({ project_id: projectId, provider: PROVIDER }, ['project_id', 'provider']),
    annotations: { destructiveHint: true, idempotentHint: true },
    run: (a, call) => call('POST', `${base(a)}/integrations/${id(a, 'provider')}/disconnect`),
  }),
  write({
    name: 'set_stripe_webhook_secret',
    title: 'Set the Stripe webhook secret',
    description: 'Store the Stripe webhook signing secret so Stripe events are accepted at the store\'s Omer webhook URL (…/v1/webhooks/stripe/<project_id>).',
    inputSchema: obj({ project_id: projectId, webhook_secret: str('Stripe signing secret (whsec_…).') }, ['project_id', 'webhook_secret']),
    annotations: { idempotentHint: true },
    run: (a, call) => call('PUT', `${base(a)}/integrations/stripe/webhook-secret`, { webhookSecret: text(a, 'webhook_secret') }),
  }),
];

export const TOOLS_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));
export { ArgError };
