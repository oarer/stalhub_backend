/*
  Warnings:

  - The values [EXBO] on the enum `AvatarSource` will be removed. If these variants are still used in the database, this will fail.

*/
-- CreateEnum
CREATE TYPE "BgVariant" AS ENUM ('COLOR', 'AVATAR', 'NONE');

-- AlterEnum
BEGIN;
CREATE TYPE "AvatarSource_new" AS ENUM ('DISCORD', 'TELEGRAM');
ALTER TABLE "UserSettings" ALTER COLUMN "avatar" TYPE "AvatarSource_new" USING ("avatar"::text::"AvatarSource_new");
ALTER TYPE "AvatarSource" RENAME TO "AvatarSource_old";
ALTER TYPE "AvatarSource_new" RENAME TO "AvatarSource";
DROP TYPE "public"."AvatarSource_old";
COMMIT;

-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN     "bg_color" TEXT NOT NULL DEFAULT '#171717',
ADD COLUMN     "bg_variant" "BgVariant" NOT NULL DEFAULT 'NONE';
