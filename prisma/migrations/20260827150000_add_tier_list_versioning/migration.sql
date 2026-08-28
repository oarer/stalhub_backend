-- AlterTable
ALTER TABLE "tier_lists" ADD COLUMN     "generated_at" TIMESTAMP(3),
ADD COLUMN     "is_current" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "removed_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "tier_list_history" (
    "id" SERIAL NOT NULL,
    "external_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "item_kind" "TierItemKind" NOT NULL DEFAULT 'WEAPON',
    "category" TEXT,
    "scenario" TEXT,
    "generated_at" TIMESTAMP(3) NOT NULL,
    "removed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entries" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tier_list_history_pkey" PRIMARY KEY ("id")
);
