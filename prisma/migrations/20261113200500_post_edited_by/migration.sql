-- Mark who edited a post when it was changed by someone other than the author
ALTER TABLE "posts" ADD COLUMN "edited_by_id" INTEGER;
ALTER TABLE "posts" ADD COLUMN "edited_by_name" TEXT;

-- ForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_edited_by_id_fkey" FOREIGN KEY ("edited_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
