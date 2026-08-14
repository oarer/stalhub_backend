-- CreateTable
CREATE TABLE "grenade_snapshots" (
    "id" SERIAL NOT NULL,
    "clanId" TEXT NOT NULL,
    "checkpoint" TEXT NOT NULL,
    "raid_date" TIMESTAMP(3) NOT NULL,
    "members" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grenade_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "grenade_snapshots_clanId_raid_date_idx" ON "grenade_snapshots"("clanId", "raid_date");
