-- CreateEnum
CREATE TYPE "BoostMode" AS ENUM ('ISSUED', 'SELF');

-- AlterTable
ALTER TABLE "clans" ADD COLUMN "boost_mode" "BoostMode" NOT NULL DEFAULT 'ISSUED';

-- CreateTable
CREATE TABLE "clan_boost_orders" (
    "id" SERIAL NOT NULL,
    "clanId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "playerId" INTEGER NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clan_boost_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clan_boost_orders_clanId_date_idx" ON "clan_boost_orders"("clanId", "date");

-- AddForeignKey
ALTER TABLE "clan_boost_orders" ADD CONSTRAINT "clan_boost_orders_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "clan_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clan_boost_orders" ADD CONSTRAINT "clan_boost_orders_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
