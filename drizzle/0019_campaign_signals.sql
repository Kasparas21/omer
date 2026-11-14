ALTER TABLE "project_visits" ADD COLUMN IF NOT EXISTS "tz" text;
--> statement-breakpoint
ALTER TABLE "onboarding_projects" ADD COLUMN IF NOT EXISTS "personal_followups" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_signals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "onboarding_projects"("id") ON DELETE cascade,
  "visitor_id" text NOT NULL,
  "kind" text NOT NULL,
  "path" text,
  "data" jsonb NOT NULL,
  "seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_signals_visitor_idx" ON "project_signals" ("project_id","visitor_id","seen_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_signals_kind_idx" ON "project_signals" ("project_id","kind","seen_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_products" (
  "project_id" uuid NOT NULL REFERENCES "onboarding_projects"("id") ON DELETE cascade,
  "path" text NOT NULL,
  "name" text NOT NULL,
  "price_cents" bigint,
  "currency" text,
  "available" boolean,
  "image" text,
  "prev_price_cents" bigint,
  "price_changed_at" timestamp with time zone,
  "restocked_at" timestamp with time zone,
  "sold_out_at" timestamp with time zone,
  "checked_at" timestamp with time zone DEFAULT now() NOT NULL,
  "seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "project_products_pk" PRIMARY KEY("project_id","path")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_products_checked_idx" ON "project_products" ("checked_at");
