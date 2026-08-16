-- DropForeignKey
ALTER TABLE "arts" DROP CONSTRAINT "arts_authorId_fkey";

-- AlterTable
ALTER TABLE "arts" ADD COLUMN     "author_name" TEXT,
ADD COLUMN     "author_social_links" JSONB,
ALTER COLUMN "authorId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "arts" ADD CONSTRAINT "arts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
