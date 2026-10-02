-- CreateTable
CREATE TABLE "sc_api_nodes" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "base_url" TEXT NOT NULL,
    "api_key" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "timeout_ms" INTEGER NOT NULL DEFAULT 10000,
    "last_seen_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sc_api_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sc_api_tokens" (
    "id" SERIAL NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "token_encrypted" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "token_tail" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sc_api_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sc_api_nodes_name_key" ON "sc_api_nodes"("name");

-- CreateIndex
CREATE UNIQUE INDEX "sc_api_tokens_token_hash_key" ON "sc_api_tokens"("token_hash");
