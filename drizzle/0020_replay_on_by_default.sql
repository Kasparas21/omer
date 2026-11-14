-- Session replay should be on for every project when storage exists.
ALTER TABLE "onboarding_projects" ALTER COLUMN "replay_enabled" SET DEFAULT true;
UPDATE "onboarding_projects" SET "replay_enabled" = true WHERE "replay_enabled" = false;
