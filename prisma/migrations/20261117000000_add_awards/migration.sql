-- CreateEnum
CREATE TYPE "AwardStatus" AS ENUM ('DRAFT', 'VOTING', 'ENDED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "AwardCategoryKind" AS ENUM ('NOMINEES', 'UPDATES', 'CLAN');

-- CreateTable
CREATE TABLE "award_campaigns" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'StalZone Awards',
    "status" "AwardStatus" NOT NULL DEFAULT 'DRAFT',
    "ends_at" TIMESTAMP(3),
    "voting_closed_at" TIMESTAMP(3),
    "results_published_at" TIMESTAMP(3),
    "results_snapshot" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "award_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "award_categories" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title_i18n" JSONB NOT NULL,
    "description_i18n" JSONB,
    "kind" "AwardCategoryKind" NOT NULL DEFAULT 'NOMINEES',
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "award_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "award_nominees" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "date" TIMESTAMP(3),
    "patch_url" TEXT,
    "clan_id" TEXT,
    "clan_name" TEXT,
    "clan_tag" TEXT,
    "clan_member_count" INTEGER,
    "nominated_by" INTEGER,
    "social_links" JSONB,
    "description_i18n" JSONB,
    "position" INTEGER NOT NULL DEFAULT 0,
    "manual_place" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "award_nominees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "award_votes" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "nominee_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "excluded_at" TIMESTAMP(3),
    "excluded_by" INTEGER,
    "exclude_reason" TEXT,
    CONSTRAINT "award_votes_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "award_campaigns_year_key" ON "award_campaigns"("year");
CREATE UNIQUE INDEX "award_categories_campaign_id_slug_key" ON "award_categories"("campaign_id", "slug");
CREATE INDEX "award_categories_campaign_id_position_idx" ON "award_categories"("campaign_id", "position");
CREATE UNIQUE INDEX "award_nominees_category_id_clan_id_key" ON "award_nominees"("category_id", "clan_id");
CREATE INDEX "award_nominees_category_id_position_idx" ON "award_nominees"("category_id", "position");

-- Data invariants enforced at the database boundary.
ALTER TABLE "award_nominees" ADD CONSTRAINT "award_nominees_position_check" CHECK ("position" >= 0);
ALTER TABLE "award_nominees" ADD CONSTRAINT "award_nominees_manual_place_check" CHECK ("manual_place" IS NULL OR "manual_place" > 0);
ALTER TABLE "award_nominees" ADD CONSTRAINT "award_nominees_clan_member_count_check" CHECK ("clan_member_count" IS NULL OR "clan_member_count" >= 0);
CREATE UNIQUE INDEX "award_votes_category_id_user_id_key" ON "award_votes"("category_id", "user_id");
CREATE INDEX "award_votes_nominee_id_idx" ON "award_votes"("nominee_id");
CREATE INDEX "award_votes_created_at_idx" ON "award_votes"("created_at");
CREATE INDEX "award_votes_category_id_excluded_at_idx" ON "award_votes"("category_id", "excluded_at");

-- Foreign keys
ALTER TABLE "award_categories" ADD CONSTRAINT "award_categories_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "award_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "award_nominees" ADD CONSTRAINT "award_nominees_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "award_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "award_nominees" ADD CONSTRAINT "award_nominees_clan_id_fkey" FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "award_votes" ADD CONSTRAINT "award_votes_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "award_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "award_votes" ADD CONSTRAINT "award_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "award_votes" ADD CONSTRAINT "award_votes_nominee_id_fkey" FOREIGN KEY ("nominee_id") REFERENCES "award_nominees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the awards admin permission for existing and future deployments.
INSERT INTO "permission" ("name", "description") VALUES ('awards:manage', 'Manage StalZone Awards campaigns and voting') ON CONFLICT ("name") DO NOTHING;
