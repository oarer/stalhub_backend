-- CreateTable
CREATE TABLE "clan_history" (
    "id" INTEGER NOT NULL,
    "player_name" TEXT NOT NULL,
    "region" TEXT NOT NULL DEFAULT 'RU',
    "clan_id" TEXT NOT NULL,
    "clan_name" TEXT NOT NULL,
    "clan_tag" TEXT NOT NULL DEFAULT '',
    "alliance" TEXT NOT NULL DEFAULT '',
    "rank" TEXT NOT NULL DEFAULT '',
    "joined_at" TIMESTAMP(3),
    "seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER,

    CONSTRAINT "clan_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clan_history_userId_seen_at_idx" ON "clan_history"("userId", "seen_at");

-- CreateIndex
CREATE INDEX "clan_history_player_name_seen_at_idx" ON "clan_history"("player_name", "seen_at");

-- AddForeignKey
ALTER TABLE "clan_history" ADD CONSTRAINT "clan_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
