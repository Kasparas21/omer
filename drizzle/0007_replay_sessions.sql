CREATE TABLE "project_replay_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"visitor_id" text NOT NULL,
	"session_id" text NOT NULL,
	"tab_id" text DEFAULT 'main' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"status" text DEFAULT 'recording' NOT NULL,
	"bytes" bigint DEFAULT 0 NOT NULL,
	"has_full_snapshot" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_replay_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_pk" uuid NOT NULL,
	"seq" bigint NOT NULL,
	"client_batch_id" text NOT NULL,
	"checksum" text NOT NULL,
	"object_key" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"has_full_snapshot" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_replay_sessions" ADD CONSTRAINT "project_replay_sessions_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."onboarding_projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_replay_chunks" ADD CONSTRAINT "project_replay_chunks_session_pk_fk" FOREIGN KEY ("session_pk") REFERENCES "public"."project_replay_sessions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "project_replay_sessions_visitor_idx" ON "project_replay_sessions" USING btree ("project_id","visitor_id","started_at" DESC);
--> statement-breakpoint
CREATE UNIQUE INDEX "project_replay_sessions_sid_uidx" ON "project_replay_sessions" ("project_id","session_id","tab_id");
--> statement-breakpoint
CREATE INDEX "project_replay_chunks_session_idx" ON "project_replay_chunks" USING btree ("session_pk","seq");
--> statement-breakpoint
CREATE UNIQUE INDEX "project_replay_chunks_batch_uidx" ON "project_replay_chunks" ("session_pk","client_batch_id");
