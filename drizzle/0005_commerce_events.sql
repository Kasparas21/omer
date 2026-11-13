CREATE TABLE "project_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"visitor_id" text NOT NULL,
	"order_id" text,
	"amount_cents" bigint NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"path" text,
	"referrer" text,
	"products" jsonb,
	"campaign" text,
	"is_returning" boolean DEFAULT false NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_identities" (
	"project_id" uuid NOT NULL,
	"visitor_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_identities_pk" PRIMARY KEY("project_id","visitor_id")
);
--> statement-breakpoint
CREATE TABLE "project_email_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"visitor_id" text NOT NULL,
	"type" text NOT NULL,
	"campaign" text,
	"message_id" text,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_purchases" ADD CONSTRAINT "project_purchases_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."onboarding_projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_identities" ADD CONSTRAINT "project_identities_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."onboarding_projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_email_events" ADD CONSTRAINT "project_email_events_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."onboarding_projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "project_purchases_project_seen_idx" ON "project_purchases" USING btree ("project_id","seen_at" DESC);
--> statement-breakpoint
CREATE INDEX "project_purchases_visitor_idx" ON "project_purchases" USING btree ("project_id","visitor_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "project_purchases_order_uidx" ON "project_purchases" ("project_id","order_id") WHERE "order_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "project_identities_email_idx" ON "project_identities" USING btree ("project_id","email");
--> statement-breakpoint
CREATE INDEX "project_email_events_project_seen_idx" ON "project_email_events" USING btree ("project_id","seen_at" DESC);
