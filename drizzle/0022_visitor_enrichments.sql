-- Public person/company context from Firecrawl Alexandria (email → PDL enrich).
CREATE TABLE IF NOT EXISTS "project_visitor_enrichments" (
  "project_id" uuid NOT NULL REFERENCES "onboarding_projects"("id") ON DELETE cascade,
  "visitor_id" text NOT NULL,
  "email" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "person_json" jsonb,
  "company_json" jsonb,
  "sources_json" jsonb,
  "provider" text,
  "credits_used" integer DEFAULT 0 NOT NULL,
  "error" text,
  "generated_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "project_visitor_enrichments_pk" PRIMARY KEY ("project_id", "visitor_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_visitor_enrichments_email_idx"
  ON "project_visitor_enrichments" ("project_id", "email");
