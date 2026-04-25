-- CreateTable
CREATE TABLE "PlayerNote" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "scammer" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerNote_uuid_key" ON "PlayerNote"("uuid");
