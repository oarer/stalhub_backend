-- CreateEnum
CREATE TYPE "GlobalNotificationType" AS ENUM ('INFO', 'WARNING', 'DANGER');

-- CreateTable
CREATE TABLE "global_notifications" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "type" "GlobalNotificationType" NOT NULL,
    "content" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "starts_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "author_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "global_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "global_notifications_is_active_starts_at_expires_at_idx" ON "global_notifications"("is_active", "starts_at", "expires_at");

-- CreateIndex
CREATE INDEX "global_notifications_created_at_idx" ON "global_notifications"("created_at");

-- CreateIndex
CREATE INDEX "global_notifications_author_id_idx" ON "global_notifications"("author_id");

-- AddForeignKey
ALTER TABLE "global_notifications" ADD CONSTRAINT "global_notifications_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
