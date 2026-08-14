-- AlterTable
ALTER TABLE "stage_sessions" ALTER COLUMN "creatorId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "stage_sessions" ADD COLUMN     "stage_number" INTEGER;

-- CreateIndex
CREATE INDEX "stage_sessions_clanId_type_stage_number_started_at_idx" ON "stage_sessions"("clanId", "type", "stage_number", "started_at");
