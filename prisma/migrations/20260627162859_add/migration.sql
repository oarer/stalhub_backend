/*
  Warnings:

  - The `role` column on the `PlayerNote` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the `Notification` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "PlayerRole" AS ENUM ('EXBO', 'MEDIA', 'SCAMMER', 'STALHUB', 'SPONSOR', 'HELPER', 'BUGBOUNTY');

-- AlterTable
ALTER TABLE "PlayerNote" DROP COLUMN "role",
ADD COLUMN     "role" "PlayerRole" NOT NULL DEFAULT 'SCAMMER';

-- DropTable
DROP TABLE "Notification";

-- DropEnum
DROP TYPE "Role";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permission" (
    "roleId" INTEGER NOT NULL,
    "permissionId" INTEGER NOT NULL,

    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "user_role" (
    "userId" TEXT NOT NULL,
    "roleId" INTEGER NOT NULL,

    CONSTRAINT "user_role_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "UserBadges" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "UserBadges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "banned" BOOLEAN NOT NULL DEFAULT false,
    "profile_theme" INTEGER NOT NULL DEFAULT 0,
    "theme_color" TEXT NOT NULL DEFAULT 'var(--main-card-color)',
    "public_profile" BOOLEAN NOT NULL DEFAULT true,
    "skip_ppl_check" BOOLEAN NOT NULL DEFAULT false,
    "autoload" BOOLEAN NOT NULL DEFAULT true,
    "prefer_avatar" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscordAuth" (
    "id" SERIAL NOT NULL,
    "discord_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "avatar_id" TEXT,
    "userid" TEXT NOT NULL,
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscordAuth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramAuth" (
    "id" SERIAL NOT NULL,
    "telegram_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "login" TEXT,
    "avatar_id" TEXT,
    "userid" TEXT NOT NULL,
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramAuth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EXBOAuth" (
    "id" SERIAL NOT NULL,
    "exbo_id" TEXT NOT NULL,
    "login" TEXT NOT NULL DEFAULT '',
    "username" TEXT NOT NULL DEFAULT '',
    "token_blob" TEXT NOT NULL,
    "access_expires_at" TIMESTAMP(3) NOT NULL,
    "refresh_expires_at" TIMESTAMP(3),
    "userid" TEXT NOT NULL,
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EXBOAuth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EXBOOAuthState" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EXBOOAuthState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sessions" (
    "id" SERIAL NOT NULL,
    "sessionId" TEXT NOT NULL DEFAULT '',
    "User_Agent" TEXT NOT NULL DEFAULT '',
    "userId" TEXT NOT NULL,
    "last_accessed" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notifications" (
    "id" SERIAL NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "author" TEXT NOT NULL DEFAULT 'Система',
    "type" INTEGER NOT NULL DEFAULT 0,
    "creation_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_UserToUserBadges" (
    "A" TEXT NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_UserToUserBadges_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_Notifications" (
    "A" INTEGER NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_Notifications_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "role_name_key" ON "role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permission_name_key" ON "permission"("name");

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscordAuth_discord_id_key" ON "DiscordAuth"("discord_id");

-- CreateIndex
CREATE UNIQUE INDEX "DiscordAuth_userid_key" ON "DiscordAuth"("userid");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramAuth_telegram_id_key" ON "TelegramAuth"("telegram_id");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramAuth_userid_key" ON "TelegramAuth"("userid");

-- CreateIndex
CREATE UNIQUE INDEX "EXBOAuth_exbo_id_key" ON "EXBOAuth"("exbo_id");

-- CreateIndex
CREATE UNIQUE INDEX "EXBOAuth_userid_key" ON "EXBOAuth"("userid");

-- CreateIndex
CREATE UNIQUE INDEX "EXBOOAuthState_state_key" ON "EXBOOAuthState"("state");

-- CreateIndex
CREATE UNIQUE INDEX "Sessions_sessionId_key" ON "Sessions"("sessionId");

-- CreateIndex
CREATE INDEX "_UserToUserBadges_B_index" ON "_UserToUserBadges"("B");

-- CreateIndex
CREATE INDEX "_Notifications_B_index" ON "_Notifications"("B");

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscordAuth" ADD CONSTRAINT "DiscordAuth_userid_fkey" FOREIGN KEY ("userid") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAuth" ADD CONSTRAINT "TelegramAuth_userid_fkey" FOREIGN KEY ("userid") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EXBOAuth" ADD CONSTRAINT "EXBOAuth_userid_fkey" FOREIGN KEY ("userid") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sessions" ADD CONSTRAINT "Sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserToUserBadges" ADD CONSTRAINT "_UserToUserBadges_A_fkey" FOREIGN KEY ("A") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserToUserBadges" ADD CONSTRAINT "_UserToUserBadges_B_fkey" FOREIGN KEY ("B") REFERENCES "UserBadges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_Notifications" ADD CONSTRAINT "_Notifications_A_fkey" FOREIGN KEY ("A") REFERENCES "Notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_Notifications" ADD CONSTRAINT "_Notifications_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
