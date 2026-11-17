ALTER TYPE "PostSource" RENAME TO "PostSource_old";

CREATE TYPE "PostSource" AS ENUM ('USER', 'TG', 'YOUTUBE', 'EFORUM');

ALTER TABLE "posts" ALTER COLUMN "source" DROP DEFAULT;
ALTER TABLE "posts" ALTER COLUMN "source" TYPE TEXT USING "source"::text;
UPDATE "posts" SET "source" = 'TG' WHERE "source" IN ('EXBO_TG', 'STALZONE_REPORT', 'OFFICIAL_MEDIA');
ALTER TABLE "posts" ALTER COLUMN "source" TYPE "PostSource" USING "source"::"PostSource";
ALTER TABLE "posts" ALTER COLUMN "source" SET DEFAULT 'USER';

DROP TYPE "PostSource_old";

CREATE TYPE "FeedSourceType" AS ENUM ('TG', 'YOUTUBE');

CREATE TABLE "feed_sources" (
    "id" SERIAL NOT NULL,
    "type" "FeedSourceType" NOT NULL,
    "external_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feed_sources_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "feed_sources_type_external_id_key" ON "feed_sources"("type", "external_id");
