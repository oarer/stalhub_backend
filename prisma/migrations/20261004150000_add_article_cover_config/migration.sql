-- Add cover_config for customizable blog cover panel
ALTER TABLE "articles" ADD COLUMN "cover_config" JSONB;
