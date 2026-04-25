/*
  Warnings:

  - You are about to drop the `PlayerScammers` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "Role" AS ENUM ('EXBO', 'MEDIA', 'SCAMMER', 'STALHUB');

-- DropTable
DROP TABLE "PlayerScammers";

-- CreateTable
CREATE TABLE "PlayerNote" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'EXBO',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerNote_uuid_key" ON "PlayerNote"("uuid");
