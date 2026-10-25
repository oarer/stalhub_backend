-- EXBOAuth.shared_at / EXBOAuth.shared_to_pool are leftovers of the removed
-- market_tracker experiment (20261007120701_market_tracker +
-- 20261007131356_remove). They are not referenced in schema.prisma, so drop
-- them to bring the database in line with the schema datamodel.
ALTER TABLE "EXBOAuth" DROP COLUMN "shared_at";
ALTER TABLE "EXBOAuth" DROP COLUMN "shared_to_pool";
