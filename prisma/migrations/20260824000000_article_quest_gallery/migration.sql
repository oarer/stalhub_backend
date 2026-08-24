-- CreateEnum
CREATE TYPE "QuestType" AS ENUM ('STORY', 'SIDE');

-- AlterTable
ALTER TABLE "articles"
  ADD COLUMN "quest_name" TEXT,
  ADD COLUMN "quest_type" "QuestType",
  ADD COLUMN "quest_map" JSONB,
  ADD COLUMN "gallery" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "reward_text" TEXT,
  ADD COLUMN "reward_money" INTEGER;

ALTER TABLE "articles"
  ADD CONSTRAINT "articles_reward_money_check" CHECK ("reward_money" IS NULL OR "reward_money" >= 0);
