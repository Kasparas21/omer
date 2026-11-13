ALTER TABLE "project_opportunities" ADD COLUMN IF NOT EXISTS "draft_json" jsonb;
--> statement-breakpoint
ALTER TABLE "project_opportunities" ADD COLUMN IF NOT EXISTS "page_json" jsonb;
--> statement-breakpoint
ALTER TABLE "project_opportunities" ADD COLUMN IF NOT EXISTS "suppressed" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_email_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "onboarding_projects"("id") ON DELETE cascade,
  "opportunity_id" uuid REFERENCES "project_opportunities"("id") ON DELETE set null,
  "visitor_id" text NOT NULL,
  "to_email" text NOT NULL,
  "subject" text NOT NULL,
  "ses_message_id" text,
  "status" text DEFAULT 'queued' NOT NULL,
  "error" text,
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_email_messages_project_idx" ON "project_email_messages" ("project_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_email_messages_opportunity_idx" ON "project_email_messages" ("opportunity_id");
