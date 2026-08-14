-- Make EXBOAuth region nullable: no region is assigned by default,
-- the user picks it during onboarding.
ALTER TABLE "EXBOAuth" ALTER COLUMN "region" DROP NOT NULL,
ALTER COLUMN "region" DROP DEFAULT;

-- Add onboarded flag to User. Existing users are considered onboarded.
ALTER TABLE "User" ADD COLUMN "onboarded" BOOLEAN NOT NULL DEFAULT false;
UPDATE "User" SET "onboarded" = true;
