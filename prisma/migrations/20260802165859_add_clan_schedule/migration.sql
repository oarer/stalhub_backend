-- DropForeignKey
ALTER TABLE "clan_applications" DROP CONSTRAINT "clan_applications_clanId_fkey";

-- DropForeignKey
ALTER TABLE "clan_applications" DROP CONSTRAINT "clan_applications_userId_fkey";

-- AlterTable
ALTER TABLE "clans" ADD COLUMN     "schedule" JSONB;

-- DropTable
DROP TABLE "clan_applications";

-- DropEnum
DROP TYPE "ClanApplicationStatus";
