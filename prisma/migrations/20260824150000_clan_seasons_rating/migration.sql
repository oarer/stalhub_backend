CREATE TYPE "ClanTier" AS ENUM ('E', 'D', 'C', 'B', 'A', 'S');

-- The previous recruitment migration constrained the integer tier to 1..4.
-- Drop it before converting the column to an enum, otherwise PostgreSQL tries
-- to evaluate the old integer comparison against ClanTier values.
ALTER TABLE "clans" DROP CONSTRAINT IF EXISTS "clans_tier_check";

ALTER TABLE "clans"
  ADD COLUMN "rating" INTEGER NOT NULL DEFAULT 0,
  ALTER COLUMN "tier" DROP DEFAULT,
  ALTER COLUMN "tier" TYPE "ClanTier" USING 'E'::"ClanTier",
  ALTER COLUMN "tier" SET DEFAULT 'E';

ALTER TABLE "clans" ADD CONSTRAINT "clans_rating_non_negative" CHECK ("rating" >= 0);

CREATE TABLE "clan_seasons" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "starts_at" TIMESTAMP(3) NOT NULL,
  "ends_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "clan_seasons_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clan_seasons_valid_range" CHECK ("ends_at" > "starts_at")
);

CREATE TABLE "clan_rating_events" (
  "id" SERIAL NOT NULL,
  "clan_id" TEXT NOT NULL,
  "season_id" INTEGER NOT NULL,
  "session_id" INTEGER NOT NULL,
  "delta" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clan_rating_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clan_rating_events_delta_check" CHECK ("delta" BETWEEN -50 AND 50 AND "delta" <> 0)
);

CREATE INDEX "clan_seasons_starts_at_ends_at_idx" ON "clan_seasons"("starts_at", "ends_at");
CREATE UNIQUE INDEX "stage_screenshots_session_id_key" ON "stage_screenshots"("session_id");
CREATE UNIQUE INDEX "clan_rating_events_session_id_key" ON "clan_rating_events"("session_id");
CREATE INDEX "clan_rating_events_clan_id_season_id_idx" ON "clan_rating_events"("clan_id", "season_id");

ALTER TABLE "clan_rating_events" ADD CONSTRAINT "clan_rating_events_clan_id_fkey"
  FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clan_rating_events" ADD CONSTRAINT "clan_rating_events_season_id_fkey"
  FOREIGN KEY ("season_id") REFERENCES "clan_seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clan_rating_events" ADD CONSTRAINT "clan_rating_events_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "stage_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
