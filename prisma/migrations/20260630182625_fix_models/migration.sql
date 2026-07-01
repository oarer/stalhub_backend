/*
  Warnings:

  - You are about to drop the column `creation_date` on the `Notifications` table. All the data in the column will be lost.
  - You are about to drop the column `profile_theme` on the `UserSettings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Notifications" DROP COLUMN "creation_date",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "UserSettings" DROP COLUMN "profile_theme";
