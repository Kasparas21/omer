CREATE TABLE IF NOT EXISTS "project_campaigns" (
  "id" text PRIMARY KEY NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "onboarding_projects"("id") ON DELETE cascade,
  "data" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_campaigns_project_idx" ON "project_campaigns" USING btree ("project_id");
