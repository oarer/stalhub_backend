/*
  Warnings:

  - You are about to drop the column `gallery` on the `articles` table. All the data in the column will be lost.
  - You are about to drop the column `rewards` on the `articles` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "articles" DROP COLUMN "gallery",
DROP COLUMN "rewards";
