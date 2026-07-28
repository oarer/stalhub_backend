-- CreateEnum
CREATE TYPE "ArticleType" AS ENUM ('QUEST', 'GUIDE', 'OTHER', 'STALHUB');

-- AlterTable
ALTER TABLE "articles" ADD COLUMN     "type" "ArticleType" NOT NULL DEFAULT 'OTHER';
