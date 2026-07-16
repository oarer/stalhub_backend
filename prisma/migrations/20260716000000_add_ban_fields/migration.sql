-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN "ban_reason" TEXT,
ADD COLUMN "ban_expires_at" TIMESTAMP(3);
