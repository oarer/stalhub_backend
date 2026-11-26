-- Test campaigns may share a year, so the year is no longer unique.
DROP INDEX "award_campaigns_year_key";

-- AlterTable
ALTER TABLE "award_campaigns" ADD COLUMN "is_test" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "award_campaigns_year_idx" ON "award_campaigns"("year");

-- Only real (non-test) campaigns must stay unique per year.
CREATE UNIQUE INDEX "award_campaigns_year_non_test_key"
ON "award_campaigns"("year")
WHERE "is_test" = false;
