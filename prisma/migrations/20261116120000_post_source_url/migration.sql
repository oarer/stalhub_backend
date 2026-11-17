ALTER TABLE "posts" ADD COLUMN "source_url" TEXT;

UPDATE "posts" p
SET "source_url" = 'https://t.me/' || fs."external_id"
FROM "feed_sources" fs
WHERE p."source" = 'TG'
    AND fs."type" = 'TG'
    AND split_part(p."external_key", ':', 2) = fs."external_id"
    AND fs."external_id" ~ '^[A-Za-z0-9_]{4,64}$'
    AND p."source_url" IS NULL;

UPDATE "posts" p
SET "author_name" = fs."label"
FROM "feed_sources" fs
WHERE p."source" = 'TG'
    AND fs."type" = 'TG'
    AND split_part(p."external_key", ':', 2) = fs."external_id"
    AND coalesce(p."author_name", '') = '';
