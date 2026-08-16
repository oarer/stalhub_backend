-- CreateEnum
CREATE TYPE "ArtType" AS ENUM ('DEFAULT', 'NSFW');

-- AlterEnum
ALTER TYPE "StarTargetType" ADD VALUE 'ART';

-- CreateTable
CREATE TABLE "arts" (
    "id" SERIAL NOT NULL,
    "external_id" TEXT NOT NULL,
    "type" "ArtType" NOT NULL DEFAULT 'DEFAULT',
    "title" TEXT NOT NULL,
    "image_url" TEXT,
    "tags" TEXT NOT NULL DEFAULT '',
    "authorId" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "arts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "arts_external_id_key" ON "arts"("external_id");

-- AddForeignKey
ALTER TABLE "arts" ADD CONSTRAINT "arts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "article_comments" ADD COLUMN "artId" INTEGER;
ALTER TABLE "article_comments" ALTER COLUMN "articleId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "article_comments" ADD CONSTRAINT "article_comments_artId_fkey" FOREIGN KEY ("artId") REFERENCES "arts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
