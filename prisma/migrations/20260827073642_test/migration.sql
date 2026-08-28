-- CreateEnum
CREATE TYPE "Faction" AS ENUM ('BANDITS', 'STALKERS', 'ALL');

-- CreateEnum
CREATE TYPE "TierRank" AS ENUM ('S', 'A', 'B', 'C', 'D', 'E');

-- CreateEnum
CREATE TYPE "TierListKind" AS ENUM ('SYSTEM', 'USER');

-- CreateEnum
CREATE TYPE "TierItemKind" AS ENUM ('ARMOR', 'WEAPON');

-- AlterEnum
ALTER TYPE "ArticleType" ADD VALUE 'FACTION';

-- AlterTable
ALTER TABLE "articles" ADD COLUMN     "faction" "Faction",
ADD COLUMN     "views" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "arts" ADD COLUMN     "views" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "builds" ADD COLUMN     "views" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "tier_lists" (
    "id" SERIAL NOT NULL,
    "external_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "kind" "TierListKind" NOT NULL DEFAULT 'USER',
    "item_kind" "TierItemKind" NOT NULL DEFAULT 'WEAPON',
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "scenario" TEXT,
    "author_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tier_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tier_list_entries" (
    "id" SERIAL NOT NULL,
    "tier_list_id" INTEGER NOT NULL,
    "item_id" TEXT NOT NULL,
    "rank" "TierRank" NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tier_list_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tier_lists_external_id_key" ON "tier_lists"("external_id");

-- CreateIndex
CREATE UNIQUE INDEX "tier_list_entries_tier_list_id_item_id_key" ON "tier_list_entries"("tier_list_id", "item_id");

-- AddForeignKey
ALTER TABLE "tier_lists" ADD CONSTRAINT "tier_lists_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tier_list_entries" ADD CONSTRAINT "tier_list_entries_tier_list_id_fkey" FOREIGN KEY ("tier_list_id") REFERENCES "tier_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
