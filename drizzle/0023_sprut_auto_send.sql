ALTER TABLE "project_opportunities" ADD COLUMN IF NOT EXISTS "auto_send_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "project_opportunities" ADD COLUMN IF NOT EXISTS "send_error" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_opportunities_auto_send_at_idx"
  ON "project_opportunities" ("auto_send_at")
  WHERE "auto_send_at" IS NOT NULL;
