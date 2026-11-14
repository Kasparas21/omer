CREATE TABLE IF NOT EXISTS "project_sending" (
  "project_id" uuid PRIMARY KEY NOT NULL REFERENCES "onboarding_projects"("id") ON DELETE cascade,
  "from_name" text,
  "from_email" text,
  "domain" text,
  "provider" text DEFAULT 'ses' NOT NULL,
  "status" text DEFAULT 'none' NOT NULL,
  "dns_records" jsonb,
  "provider_ref" text,
  "verified_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_email_messages" ADD COLUMN IF NOT EXISTS "provider" text;
--> statement-breakpoint
ALTER TABLE "project_email_messages" ADD COLUMN IF NOT EXISTS "from_email" text;
