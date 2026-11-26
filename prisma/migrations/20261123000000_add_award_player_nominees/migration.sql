-- AlterEnum
ALTER TYPE "AwardCategoryKind" ADD VALUE 'PLAYER';

-- AlterTable
ALTER TABLE "award_nominees" ADD COLUMN "player_uuid" TEXT;
ALTER TABLE "award_nominees" ADD COLUMN "player_region" TEXT;
ALTER TABLE "award_nominees" ADD COLUMN "player_alliance" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "award_nominees_category_id_player_uuid_key" ON "award_nominees"("category_id", "player_uuid");

-- Player nominations are resolved from verified player profiles, so the
-- uuid must be present (existing clan/manual nominees have no player uuid).
ALTER TABLE "award_nominees" ADD CONSTRAINT "award_nominees_player_fields_check" CHECK (
    ("player_uuid" IS NULL AND "player_region" IS NULL AND "player_alliance" IS NULL)
    OR ("player_uuid" IS NOT NULL AND "player_region" IS NOT NULL)
);
