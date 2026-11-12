CREATE TABLE "onboarding_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner" text NOT NULL,
	"name" text NOT NULL,
	"origin" text NOT NULL,
	"write_key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"first_event_at" timestamp with time zone,
	CONSTRAINT "onboarding_projects_write_key_unique" UNIQUE("write_key")
);
--> statement-breakpoint
CREATE INDEX "onboarding_projects_owner_idx" ON "onboarding_projects" USING btree ("owner");