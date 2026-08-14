-- AlterTable
ALTER TABLE "clan_squads" ADD COLUMN "leaderId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "clan_squads_leaderId_key" ON "clan_squads"("leaderId");

-- AddForeignKey
ALTER TABLE "clan_squads" ADD CONSTRAINT "clan_squads_leaderId_fkey" FOREIGN KEY ("leaderId") REFERENCES "clan_squad_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
