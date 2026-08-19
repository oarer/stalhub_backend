-- CreateTable
CREATE TABLE "clan_member_notes" (
    "id" SERIAL NOT NULL,
    "clanId" TEXT NOT NULL,
    "memberId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clan_member_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grenade_boxes" (
    "id" SERIAL NOT NULL,
    "clanId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grenade_boxes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clan_member_notes_clanId_idx" ON "clan_member_notes"("clanId");

-- CreateIndex
CREATE INDEX "clan_member_notes_memberId_idx" ON "clan_member_notes"("memberId");

-- CreateIndex
CREATE INDEX "grenade_boxes_clanId_date_idx" ON "grenade_boxes"("clanId", "date");

-- AddForeignKey
ALTER TABLE "clan_member_notes" ADD CONSTRAINT "clan_member_notes_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "clan_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clan_member_notes" ADD CONSTRAINT "clan_member_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
