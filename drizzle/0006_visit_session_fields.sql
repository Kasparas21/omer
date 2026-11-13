ALTER TABLE "project_visits" ADD COLUMN "session_id" text;
--> statement-breakpoint
ALTER TABLE "project_visits" ADD COLUMN "device" text;
--> statement-breakpoint
ALTER TABLE "project_visits" ADD COLUMN "dwell_ms" bigint DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "onboarding_projects" ADD COLUMN "replay_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE INDEX "project_visits_session_idx" ON "project_visits" USING btree ("project_id","visitor_id","session_id","seen_at");
