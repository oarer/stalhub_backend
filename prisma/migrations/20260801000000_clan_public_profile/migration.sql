-- CreateEnum
CREATE TYPE "ClanApplicationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELED');

-- AlterTable
ALTER TABLE "clans" ADD COLUMN     "is_public" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recruiting" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "public_fields" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "clan_applications" (
    "id" SERIAL NOT NULL,
    "clanId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "status" "ClanApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clan_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clan_applications_clanId_status_idx" ON "clan_applications"("clanId", "status");

-- CreateIndex
CREATE INDEX "clan_applications_userId_status_idx" ON "clan_applications"("userId", "status");

-- AddForeignKey
ALTER TABLE "clan_applications" ADD CONSTRAINT "clan_applications_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clan_applications" ADD CONSTRAINT "clan_applications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
