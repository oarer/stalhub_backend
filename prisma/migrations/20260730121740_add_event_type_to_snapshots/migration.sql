/*
  Warnings:

  - Added the required column `event_type` to the `grenade_snapshots` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "grenade_snapshots" ADD COLUMN     "event_type" TEXT NOT NULL;
