CREATE TABLE IF NOT EXISTS "project_brand" (
  "project_id" uuid PRIMARY KEY NOT NULL REFERENCES "onboarding_projects"("id") ON DELETE cascade,
  "data" jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
