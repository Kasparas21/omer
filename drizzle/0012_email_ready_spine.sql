CREATE TABLE IF NOT EXISTS "project_opportunities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "onboarding_projects"("id") ON DELETE cascade,
  "visitor_id" text NOT NULL,
  "status" text DEFAULT 'review' NOT NULL,
  "reason" text,
  "hooks_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "insight_summary" text,
  "email" text,
  "name" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_opportunities_project_visitor_idx" ON "project_opportunities" ("project_id","visitor_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_opportunities_project_status_idx" ON "project_opportunities" ("project_id","status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_campaign_suggestions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "onboarding_projects"("id") ON DELETE cascade,
  "pattern_key" text NOT NULL,
  "title" text NOT NULL,
  "audience_summary" text NOT NULL,
  "evidence_count" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'suggested' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_campaign_suggestions_project_pattern_idx" ON "project_campaign_suggestions" ("project_id","pattern_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_campaign_suggestions_project_status_idx" ON "project_campaign_suggestions" ("project_id","status");
