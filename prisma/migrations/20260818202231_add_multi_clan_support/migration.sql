/*
  Warnings:

  - The primary key for the `user_clan_profile` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Made the column `clanId` on table `user_clan_profile` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "user_clan_profile" DROP CONSTRAINT "user_clan_profile_clanId_fkey";

-- AlterTable
ALTER TABLE "user_clan_profile" DROP CONSTRAINT "user_clan_profile_pkey",
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "clanId" SET NOT NULL,
ADD CONSTRAINT "user_clan_profile_pkey" PRIMARY KEY ("userId", "clanId");

-- AddForeignKey
ALTER TABLE "user_clan_profile" ADD CONSTRAINT "user_clan_profile_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
