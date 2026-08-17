-- AlterTable
ALTER TABLE "User" ADD COLUMN "password_hash" TEXT;

-- AlterTable
ALTER TABLE "bot_guilds" ADD COLUMN "stages_channel_id" TEXT;

-- CreateTable
CREATE TABLE "clan_invites" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "clan_id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "claimed_by" TEXT,
    "claimed_at" TIMESTAMP(3),
    "created_by" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clan_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clan_invites_code_key" ON "clan_invites"("code");

-- CreateIndex
CREATE UNIQUE INDEX "clan_invites_userId_key" ON "clan_invites"("userId");

-- AddForeignKey
ALTER TABLE "clan_invites" ADD CONSTRAINT "clan_invites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
