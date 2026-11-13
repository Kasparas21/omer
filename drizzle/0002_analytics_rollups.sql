CREATE TABLE "project_daily_visitors" (
	"project_id" uuid NOT NULL,
	"day" date NOT NULL,
	"visitor_id" text NOT NULL,
	CONSTRAINT "project_daily_visitors_pk" PRIMARY KEY("project_id","day","visitor_id")
);
--> statement-breakpoint
CREATE TABLE "project_path_views" (
	"project_id" uuid NOT NULL,
	"day" date NOT NULL,
	"path" text NOT NULL,
	"count" bigint NOT NULL,
	CONSTRAINT "project_path_views_pk" PRIMARY KEY("project_id","day","path")
);
--> statement-breakpoint
CREATE TABLE "project_referrer_views" (
	"project_id" uuid NOT NULL,
	"day" date NOT NULL,
	"referrer" text NOT NULL,
	"count" bigint NOT NULL,
	CONSTRAINT "project_referrer_views_pk" PRIMARY KEY("project_id","day","referrer")
);
--> statement-breakpoint
CREATE TABLE "project_dwell" (
	"project_id" uuid NOT NULL,
	"day" date NOT NULL,
	"total_ms" bigint NOT NULL,
	"samples" bigint NOT NULL,
	CONSTRAINT "project_dwell_pk" PRIMARY KEY("project_id","day")
);
--> statement-breakpoint
ALTER TABLE "project_daily_visitors" ADD CONSTRAINT "project_daily_visitors_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."onboarding_projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_path_views" ADD CONSTRAINT "project_path_views_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."onboarding_projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_referrer_views" ADD CONSTRAINT "project_referrer_views_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."onboarding_projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_dwell" ADD CONSTRAINT "project_dwell_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."onboarding_projects"("id") ON DELETE cascade ON UPDATE no action;
