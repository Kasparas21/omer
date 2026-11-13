CREATE TABLE "project_replay_insights" (
	"session_pk" uuid PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"summary_text" text,
	"outcome" text,
	"friction" double precision,
	"worth_watching" boolean,
	"primary_interest" text,
	"decisions_json" jsonb,
	"model" text,
	"generated_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "project_replay_insights" ADD CONSTRAINT "project_replay_insights_session_pk_fk" FOREIGN KEY ("session_pk") REFERENCES "public"."project_replay_sessions"("id") ON DELETE cascade ON UPDATE no action;
