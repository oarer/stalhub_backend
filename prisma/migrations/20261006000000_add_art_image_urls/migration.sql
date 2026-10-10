-- Add multi-image support for arts (up to 10, image_url stays as cover for compat)
ALTER TABLE "arts" ADD COLUMN "image_urls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Backfill: use existing image_url as single-element array where present
UPDATE "arts" SET "image_urls" = ARRAY["image_url"] WHERE "image_url" IS NOT NULL AND "image_url" <> '';
