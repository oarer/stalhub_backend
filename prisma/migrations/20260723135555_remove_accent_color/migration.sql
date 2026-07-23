/*
  Warnings:

  - You are about to drop the column `accent_color` on the `articles` table. All the data in the column will be lost.
  - You are about to drop the column `accent_color` on the `builds` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "articles" DROP COLUMN "accent_color";

-- AlterTable
ALTER TABLE "builds" DROP COLUMN "accent_color";
