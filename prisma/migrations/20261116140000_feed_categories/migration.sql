ALTER TABLE "posts" ADD COLUMN "feed_source_id" INTEGER;

CREATE TABLE "feed_categories" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feed_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "feed_source_categories" (
    "source_id" INTEGER NOT NULL,
    "category_id" INTEGER NOT NULL,

    CONSTRAINT "feed_source_categories_pkey" PRIMARY KEY ("source_id", "category_id")
);

CREATE UNIQUE INDEX "feed_categories_name_key" ON "feed_categories"("name");
CREATE INDEX "posts_feed_source_id_idx" ON "posts"("feed_source_id");
CREATE INDEX "feed_source_categories_category_id_idx" ON "feed_source_categories"("category_id");

ALTER TABLE "posts" ADD CONSTRAINT "posts_feed_source_id_fkey" FOREIGN KEY ("feed_source_id") REFERENCES "feed_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "feed_source_categories" ADD CONSTRAINT "feed_source_categories_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "feed_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "feed_source_categories" ADD CONSTRAINT "feed_source_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "feed_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "posts" p
SET "feed_source_id" = fs."id"
FROM "feed_sources" fs
WHERE p."source" = 'TG'
    AND fs."type" = 'TG'
    AND split_part(p."external_key", ':', 2) = fs."external_id";

UPDATE "posts" p
SET "feed_source_id" = fs."id"
FROM "feed_sources" fs
WHERE p."source" = 'YOUTUBE'
    AND fs."type" = 'YOUTUBE'
    AND p."source_url" = 'https://www.youtube.com/channel/' || fs."external_id";
