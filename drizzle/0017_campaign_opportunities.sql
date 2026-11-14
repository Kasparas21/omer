ALTER TABLE "project_opportunities" ADD COLUMN IF NOT EXISTS "campaign_id" text;
--> statement-breakpoint
DROP INDEX IF EXISTS "project_opportunities_project_visitor_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_opportunities_project_visitor_idx" ON "project_opportunities" ("project_id","visitor_id") WHERE "campaign_id" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_opportunities_campaign_visitor_idx" ON "project_opportunities" ("project_id","campaign_id","visitor_id") WHERE "campaign_id" IS NOT NULL;
