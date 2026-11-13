ALTER TABLE "project_replay_insights" ADD COLUMN "insight_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "project_replay_insights" ADD COLUMN "email_ready" boolean;--> statement-breakpoint
ALTER TABLE "project_replay_insights" ADD COLUMN "email_ready_confidence" double precision;--> statement-breakpoint
ALTER TABLE "project_replay_insights" ADD COLUMN "stage" text;--> statement-breakpoint
ALTER TABLE "project_replay_insights" ADD COLUMN "intent" double precision;--> statement-breakpoint
ALTER TABLE "project_replay_insights" ADD COLUMN "highlights_json" jsonb;--> statement-breakpoint
ALTER TABLE "project_replay_insights" ADD COLUMN "email_hooks_json" jsonb;--> statement-breakpoint
CREATE TABLE "project_visitor_insights" (
	"project_id" uuid NOT NULL,
	"visitor_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"insight_version" integer DEFAULT 1 NOT NULL,
	"summary_text" text,
	"email_ready" boolean,
	"email_ready_confidence" double precision,
	"interests_json" jsonb,
	"email_hooks_json" jsonb,
	"gaps_json" jsonb,
	"decisions_json" jsonb,
	"model" text,
	"source_session_count" integer DEFAULT 0 NOT NULL,
	"generated_at" timestamp with time zone,
	"error" text,
	CONSTRAINT "project_visitor_insights_pk" PRIMARY KEY("project_id","visitor_id")
);
--> statement-breakpoint
ALTER TABLE "project_visitor_insights" ADD CONSTRAINT "project_visitor_insights_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."onboarding_projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "project_visitor_insights_project_idx" ON "project_visitor_insights" USING btree ("project_id");
