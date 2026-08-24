ALTER TABLE "clans"
ADD COLUMN "leader_discord" TEXT NOT NULL DEFAULT '',
ADD COLUMN "clan_discord" TEXT,
ADD COLUMN "paid_recruitment" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "tier" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "guilds_per_week" INTEGER;

ALTER TABLE "clans"
ADD CONSTRAINT "clans_tier_check" CHECK ("tier" BETWEEN 1 AND 4),
ADD CONSTRAINT "clans_guilds_per_week_check" CHECK ("guilds_per_week" IS NULL OR "guilds_per_week" BETWEEN 0 AND 999);

-- Existing recruiting clans do not yet have a required contact. Disable their
-- recruitment card until a leader saves a Discord and explicitly enables it.
UPDATE "clans"
SET "recruiting" = false
WHERE "recruiting" = true AND BTRIM("leader_discord") = '';
