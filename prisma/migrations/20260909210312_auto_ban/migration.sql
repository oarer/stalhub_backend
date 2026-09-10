-- CreateEnum
CREATE TYPE "BanSeverity" AS ENUM ('WARN', 'BAN');

-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN     "auto_banned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "auto_warned" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ban_log" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "rule" TEXT NOT NULL,
    "severity" "BanSeverity" NOT NULL DEFAULT 'WARN',
    "auto" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT NOT NULL DEFAULT '',
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ban_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ban_log_user_id_created_at_idx" ON "ban_log"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "ban_log_rule_created_at_idx" ON "ban_log"("rule", "created_at");

-- AddForeignKey
ALTER TABLE "ban_log" ADD CONSTRAINT "ban_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
