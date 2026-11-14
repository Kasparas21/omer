-- Session replay should be on for every project when storage exists.
ALTER TABLE "projects" ALTER COLUMN "replay_enabled" SET DEFAULT true;
UPDATE "projects" SET "replay_enabled" = true WHERE "replay_enabled" = false;
