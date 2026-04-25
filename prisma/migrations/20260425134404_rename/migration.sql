/*
  Warnings:

  - You are about to drop the `PlayerNote` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "PlayerNote";

-- CreateTable
CREATE TABLE "PlayerScammers" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "scammer" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerScammers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerScammers_uuid_key" ON "PlayerScammers"("uuid");
