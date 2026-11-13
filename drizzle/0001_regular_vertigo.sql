CREATE TABLE "project_page_views" (
	"project_id" uuid NOT NULL,
	"day" date NOT NULL,
	"count" bigint NOT NULL,
	CONSTRAINT "project_page_views_project_id_day_pk" PRIMARY KEY("project_id","day")
);
--> statement-breakpoint
ALTER TABLE "project_page_views" ADD CONSTRAINT "project_page_views_project_id_onboarding_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."onboarding_projects"("id") ON DELETE cascade ON UPDATE no action;