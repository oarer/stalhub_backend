-- AlterTable
ALTER TABLE "article_comments" ADD COLUMN "profile_user_id" INTEGER;

-- CreateIndex
CREATE INDEX "article_comments_profile_user_id_idx" ON "article_comments"("profile_user_id");

-- AddForeignKey
ALTER TABLE "article_comments" ADD CONSTRAINT "article_comments_profile_user_id_fkey" FOREIGN KEY ("profile_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
