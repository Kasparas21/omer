CREATE TABLE "project_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"visitor_id" text NOT NULL,
	"path" text NOT NULL,
	"referrer" text NOT NULL,
	"cc" text,
	"city" text,
	"place" text,
	"lat" double precision,
	"lng" double precision,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_visits" ADD CONSTRAINT "project_visits_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."onboarding_projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "project_visits_project_seen_idx" ON "project_visits" USING btree ("project_id","seen_at" DESC);
