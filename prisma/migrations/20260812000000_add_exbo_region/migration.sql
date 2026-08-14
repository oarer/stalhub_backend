-- AlterTable
ALTER TABLE "EXBOAuth" ADD COLUMN "region" TEXT NOT NULL DEFAULT 'RU',
ADD COLUMN "region_changed_at" TIMESTAMP(3);
