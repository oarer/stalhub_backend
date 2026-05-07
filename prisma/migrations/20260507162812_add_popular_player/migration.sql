-- CreateTable
CREATE TABLE "PopularPlayer" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "alliance" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PopularPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PopularPlayer_uuid_key" ON "PopularPlayer"("uuid");
