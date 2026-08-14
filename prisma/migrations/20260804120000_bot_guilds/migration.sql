-- CreateTable
CREATE TABLE "bot_guilds" (
    "id" SERIAL NOT NULL,
    "guild_id" TEXT NOT NULL,
    "clan_id" TEXT NOT NULL,
    "allowed_role_id" TEXT,
    "publish_time" TEXT,
    "publish_channel_id" TEXT,
    "linked_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bot_guilds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bot_link_states" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "clan_id" TEXT NOT NULL,
    "user_id" INTEGER,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_link_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bot_guilds_guild_id_key" ON "bot_guilds"("guild_id");

-- CreateIndex
CREATE UNIQUE INDEX "bot_link_states_token_key" ON "bot_link_states"("token");
