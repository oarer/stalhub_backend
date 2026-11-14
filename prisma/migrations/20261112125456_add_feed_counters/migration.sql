ALTER TABLE "builds"
ADD COLUMN "stars_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "comments_count" INTEGER NOT NULL DEFAULT 0;

UPDATE "builds" AS b
SET "stars_count" = counts.count
FROM (
  SELECT "target_id", COUNT(*)::INTEGER AS count
  FROM "stars"
  WHERE "target_type" = 'BUILD'
  GROUP BY "target_id"
) AS counts
WHERE b."id" = counts."target_id";

ALTER TABLE "tier_lists"
ADD COLUMN "stars_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "comments_count" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "article_comments"
ADD COLUMN "build_id" INTEGER,
ADD COLUMN "tier_list_id" INTEGER;

CREATE INDEX "article_comments_build_id_idx" ON "article_comments"("build_id");
CREATE INDEX "article_comments_tier_list_id_idx" ON "article_comments"("tier_list_id");

ALTER TABLE "article_comments"
ADD CONSTRAINT "article_comments_build_id_fkey"
FOREIGN KEY ("build_id") REFERENCES "builds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "article_comments"
ADD CONSTRAINT "article_comments_tier_list_id_fkey"
FOREIGN KEY ("tier_list_id") REFERENCES "tier_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "tier_lists" AS tl
SET "stars_count" = counts.count
FROM (
  SELECT "target_id", COUNT(*)::INTEGER AS count
  FROM "stars"
  WHERE "target_type" = 'TIER_LIST'
  GROUP BY "target_id"
) AS counts
WHERE tl."id" = counts."target_id";

UPDATE "builds" AS b
SET "comments_count" = counts.count
FROM (
  SELECT "build_id", COUNT(*)::INTEGER AS count
  FROM "article_comments"
  WHERE "build_id" IS NOT NULL
  GROUP BY "build_id"
) AS counts
WHERE b."id" = counts."build_id";

UPDATE "tier_lists" AS tl
SET "comments_count" = counts.count
FROM (
  SELECT "tier_list_id", COUNT(*)::INTEGER AS count
  FROM "article_comments"
  WHERE "tier_list_id" IS NOT NULL
  GROUP BY "tier_list_id"
) AS counts
WHERE tl."id" = counts."tier_list_id";
