-- AlterTable
ALTER TABLE "clans" ADD COLUMN     "blocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "block_reason" TEXT,
ADD COLUMN     "blocked_at" TIMESTAMP(3);
