-- DropIndex
DROP INDEX "stage_attendance_sessionId_userId_key";

-- AlterTable
ALTER TABLE "stage_attendance" ADD COLUMN     "name" TEXT NOT NULL DEFAULT '',
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "stage_attendance_sessionId_name_key" ON "stage_attendance"("sessionId", "name");
