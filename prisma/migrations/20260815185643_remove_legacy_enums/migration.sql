/*
  Warnings:

  - You are about to drop the column `avatar` on the `UserSettings` table. All the data in the column will be lost.
  - You are about to drop the column `bg_color` on the `UserSettings` table. All the data in the column will be lost.
  - You are about to drop the column `bg_variant` on the `UserSettings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "UserSettings" DROP COLUMN "avatar",
DROP COLUMN "bg_color",
DROP COLUMN "bg_variant";

-- DropEnum
DROP TYPE "BgVariant";
