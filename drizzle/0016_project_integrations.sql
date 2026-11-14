CREATE TABLE IF NOT EXISTS "project_integrations" (
  "project_id" uuid NOT NULL REFERENCES "onboarding_projects"("id") ON DELETE cascade,
  "provider" text NOT NULL,
  "status" text DEFAULT 'none' NOT NULL,
  "api_key_sealed" text,
  "stripe_account_id" text,
  "webhook_secret_sealed" text,
  "last_sync_at" timestamp with time zone,
  "last_error" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("project_id", "provider")
);
--> statement-breakpoint
ALTER TABLE "project_purchases" ADD COLUMN IF NOT EXISTS "provider" text;
--> statement-breakpoint
ALTER TABLE "project_purchases" ADD COLUMN IF NOT EXISTS "provider_payment_id" text;
--> statement-breakpoint
ALTER TABLE "project_purchases" ADD COLUMN IF NOT EXISTS "customer_email" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_purchases_provider_payment_uidx"
  ON "project_purchases" ("project_id", "provider", "provider_payment_id")
  WHERE "provider_payment_id" IS NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE project_integrations TO omer_app;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
