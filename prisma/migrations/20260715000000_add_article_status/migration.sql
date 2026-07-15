-- CreateEnum
CREATE TYPE "ArticleStatus" AS ENUM ('PENDING', 'REVIEW', 'DENIED', 'BANNED');

-- AlterTable: add status and status_reason columns
ALTER TABLE "articles" ADD COLUMN "status" "ArticleStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "articles" ADD COLUMN "status_reason" TEXT;
