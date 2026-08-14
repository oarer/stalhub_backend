-- CreateEnum
CREATE TYPE "SquadMap" AS ENUM ('SMALL_BERDOVKA', 'KHVOUINOY', 'NIZINA');

-- CreateEnum
CREATE TYPE "GoldDropStatus" AS ENUM ('PENDING', 'CLAIMED');

-- AlterTable
ALTER TABLE "clan_squads" ADD COLUMN "map" "SquadMap" NOT NULL DEFAULT 'SMALL_BERDOVKA';

-- AlterTable
DROP INDEX "clan_squads_clanId_name_key";

-- CreateIndex
CREATE UNIQUE INDEX "clan_squads_clanId_map_name_key" ON "clan_squads"("clanId", "map", "name");

-- CreateTable
CREATE TABLE "clan_squad_requests" (
    "id" SERIAL NOT NULL,
    "squadId" INTEGER NOT NULL,
    "memberId" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clan_squad_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gold_drops" (
    "id" SERIAL NOT NULL,
    "clanId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "GoldDropStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gold_drops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gold_drop_attendees" (
    "id" SERIAL NOT NULL,
    "dropId" INTEGER NOT NULL,
    "memberId" INTEGER NOT NULL,

    CONSTRAINT "gold_drop_attendees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "absences" (
    "id" SERIAL NOT NULL,
    "clanId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "events" JSONB NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "absences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clan_squad_requests_squadId_memberId_key" ON "clan_squad_requests"("squadId", "memberId");

-- CreateIndex
CREATE INDEX "gold_drops_clanId_date_idx" ON "gold_drops"("clanId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "gold_drop_attendees_dropId_memberId_key" ON "gold_drop_attendees"("dropId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "absences_userId_date_key" ON "absences"("userId", "date");

-- CreateIndex
CREATE INDEX "absences_clanId_date_idx" ON "absences"("clanId", "date");

-- AddForeignKey
ALTER TABLE "clan_squad_requests" ADD CONSTRAINT "clan_squad_requests_squadId_fkey" FOREIGN KEY ("squadId") REFERENCES "clan_squads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clan_squad_requests" ADD CONSTRAINT "clan_squad_requests_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "clan_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gold_drop_attendees" ADD CONSTRAINT "gold_drop_attendees_dropId_fkey" FOREIGN KEY ("dropId") REFERENCES "gold_drops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gold_drop_attendees" ADD CONSTRAINT "gold_drop_attendees_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "clan_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absences" ADD CONSTRAINT "absences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
