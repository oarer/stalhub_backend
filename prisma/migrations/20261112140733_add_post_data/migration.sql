CREATE TABLE "posts" (
    "id" SERIAL NOT NULL,
    "external_id" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "stars_count" INTEGER NOT NULL DEFAULT 0,
    "comments_count" INTEGER NOT NULL DEFAULT 0,
    "author_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "posts_external_id_key" ON "posts"("external_id");

ALTER TABLE "posts"
ADD CONSTRAINT "posts_author_id_fkey"
FOREIGN KEY ("author_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "article_comments"
ADD COLUMN "post_id" INTEGER;

CREATE INDEX "article_comments_post_id_idx" ON "article_comments"("post_id");

ALTER TABLE "article_comments"
ADD CONSTRAINT "article_comments_post_id_fkey"
FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
