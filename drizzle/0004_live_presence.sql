ALTER TABLE "project_visits" ADD COLUMN "active_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX "project_visits_browser_seen_idx" ON "project_visits" USING btree ("project_id","visitor_id","seen_at");
