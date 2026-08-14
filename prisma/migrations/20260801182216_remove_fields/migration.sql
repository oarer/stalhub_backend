-- AlterEnum
BEGIN;
CREATE TYPE "StageType_new" AS ENUM ('TOURNAMENT', 'BRAWL', 'BASE_CAPTURE');
ALTER TABLE "public"."stage_sessions" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "stage_sessions" ALTER COLUMN "type" TYPE "StageType_new" USING ("type"::text::"StageType_new");
ALTER TABLE "grenade_snapshots" ALTER COLUMN "event_type" TYPE "StageType_new" USING ("event_type"::text::"StageType_new");
ALTER TYPE "StageType" RENAME TO "StageType_old";
ALTER TYPE "StageType_new" RENAME TO "StageType";
DROP TYPE "public"."StageType_old";
ALTER TABLE "stage_sessions" ALTER COLUMN "type" SET DEFAULT 'TOURNAMENT';
COMMIT;

-- AlterTable
ALTER TABLE "clan_applications" DROP COLUMN "message";

-- AlterTable
ALTER TABLE "grenade_snapshots" DROP COLUMN "event_type",
ADD COLUMN     "event_type" "StageType" NOT NULL;

-- AlterTable
ALTER TABLE "stage_sessions" ALTER COLUMN "type" SET DEFAULT 'TOURNAMENT';
