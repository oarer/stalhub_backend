-- CreateTable
CREATE TABLE "server_online_snapshots" (
    "id" SERIAL NOT NULL,
    "region" TEXT NOT NULL,
    "server_id" TEXT NOT NULL,
    "online" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "server_online_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "server_online_snapshots_region_created_at_idx" ON "server_online_snapshots"("region", "created_at");

-- CreateIndex
CREATE INDEX "server_online_snapshots_server_id_created_at_idx" ON "server_online_snapshots"("server_id", "created_at");
