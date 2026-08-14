-- CreateTable
CREATE TABLE "clan_squads" (
    "id" SERIAL NOT NULL,
    "clanId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdBy" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clan_squads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clan_squad_members" (
    "id" SERIAL NOT NULL,
    "squadId" INTEGER NOT NULL,
    "slot" INTEGER NOT NULL,
    "memberId" INTEGER NOT NULL,

    CONSTRAINT "clan_squad_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clan_squads_clanId_name_key" ON "clan_squads"("clanId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "clan_squad_members_squadId_slot_key" ON "clan_squad_members"("squadId", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "clan_squad_members_squadId_memberId_key" ON "clan_squad_members"("squadId", "memberId");

-- AddForeignKey
ALTER TABLE "clan_squads" ADD CONSTRAINT "clan_squads_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clan_squad_members" ADD CONSTRAINT "clan_squad_members_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "clan_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clan_squad_members" ADD CONSTRAINT "clan_squad_members_squadId_fkey" FOREIGN KEY ("squadId") REFERENCES "clan_squads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
