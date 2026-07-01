/*
  Warnings:

  - You are about to drop the column `last_accessed` on the `Sessions` table. All the data in the column will be lost.
  - You are about to drop the column `autoload` on the `UserSettings` table. All the data in the column will be lost.
  - You are about to drop the column `prefer_avatar` on the `UserSettings` table. All the data in the column will be lost.
  - You are about to drop the column `skip_ppl_check` on the `UserSettings` table. All the data in the column will be lost.
  - You are about to drop the column `theme_color` on the `UserSettings` table. All the data in the column will be lost.
  - You are about to drop the `EXBOOAuthState` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "AvatarSource" AS ENUM ('DISCORD', 'TELEGRAM', 'EXBO');

-- AlterTable
ALTER TABLE "Sessions" DROP COLUMN "last_accessed",
ADD COLUMN     "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "UserSettings" DROP COLUMN "autoload",
DROP COLUMN "prefer_avatar",
DROP COLUMN "skip_ppl_check",
DROP COLUMN "theme_color",
ADD COLUMN     "avatar" "AvatarSource" NOT NULL DEFAULT 'DISCORD',
ALTER COLUMN "public_profile" SET DEFAULT false;

-- DropTable
DROP TABLE "EXBOOAuthState";

-- CreateTable
CREATE TABLE "EXBOAuthState" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EXBOAuthState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EXBOAuthState_state_key" ON "EXBOAuthState"("state");
