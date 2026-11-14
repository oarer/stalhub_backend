ALTER TABLE "posts"
DROP CONSTRAINT "posts_author_id_fkey";

ALTER TABLE "posts"
ADD COLUMN "image_urls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "source" "PostSource" NOT NULL DEFAULT 'USER',
ADD COLUMN "external_key" TEXT,
ADD COLUMN "author_name" TEXT,
ADD COLUMN "attached_build_ids" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN "attached_tier_list_ids" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN "repost_of_id" INTEGER,
ALTER COLUMN "author_id" DROP NOT NULL;

ALTER TABLE "builds" ADD COLUMN "hidden_from_feed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tier_lists" ADD COLUMN "hidden_from_feed" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "posts_source_external_key_key"
ON "posts"("source", "external_key")
WHERE "external_key" IS NOT NULL;

CREATE INDEX "posts_repost_of_id_idx" ON "posts"("repost_of_id");

ALTER TABLE "posts"
ADD CONSTRAINT "posts_author_id_fkey"
FOREIGN KEY ("author_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "posts"
ADD CONSTRAINT "posts_repost_of_id_fkey"
FOREIGN KEY ("repost_of_id") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "post_polls" (
    "id" SERIAL NOT NULL,
    "post_id" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "type" "PollType" NOT NULL,
    CONSTRAINT "post_polls_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "post_poll_options" (
    "id" SERIAL NOT NULL,
    "poll_id" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "votes_count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "post_poll_options_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "post_poll_votes" (
    "id" SERIAL NOT NULL,
    "option_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "post_poll_votes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "post_polls_post_id_key" ON "post_polls"("post_id");
CREATE INDEX "post_poll_options_poll_id_idx" ON "post_poll_options"("poll_id");
CREATE UNIQUE INDEX "post_poll_votes_option_id_user_id_key" ON "post_poll_votes"("option_id", "user_id");
CREATE INDEX "post_poll_votes_user_id_idx" ON "post_poll_votes"("user_id");

ALTER TABLE "post_polls"
ADD CONSTRAINT "post_polls_post_id_fkey"
FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "post_poll_options"
ADD CONSTRAINT "post_poll_options_poll_id_fkey"
FOREIGN KEY ("poll_id") REFERENCES "post_polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "post_poll_votes"
ADD CONSTRAINT "post_poll_votes_option_id_fkey"
FOREIGN KEY ("option_id") REFERENCES "post_poll_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "post_poll_votes"
ADD CONSTRAINT "post_poll_votes_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
