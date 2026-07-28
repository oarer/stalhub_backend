-- CreateTable
CREATE TABLE "article_comments" (
    "id" SERIAL NOT NULL,
    "content" TEXT NOT NULL,
    "authorId" INTEGER NOT NULL,
    "articleId" INTEGER NOT NULL,
    "parentId" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_comments_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "article_comments" ADD CONSTRAINT "article_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_comments" ADD CONSTRAINT "article_comments_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_comments" ADD CONSTRAINT "article_comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "article_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
