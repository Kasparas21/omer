-- MCP access for Claude, Cursor and ChatGPT: personal API keys, OAuth clients, one-time auth codes.
CREATE TABLE IF NOT EXISTS "mcp_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "kind" text NOT NULL,
  "name" text NOT NULL,
  "prefix" text NOT NULL,
  "token_hash" text NOT NULL,
  "client_id" text,
  "expires_at" timestamp with time zone,
  "last_used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_tokens_hash_idx" ON "mcp_tokens" ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_tokens_user_idx" ON "mcp_tokens" ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mcp_oauth_clients" (
  "client_id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "redirect_uris" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mcp_oauth_codes" (
  "code_hash" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "client_id" text NOT NULL,
  "redirect_uri" text NOT NULL,
  "code_challenge" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL
);
