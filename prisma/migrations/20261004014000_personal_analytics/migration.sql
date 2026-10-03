-- CreateTable
CREATE TABLE "personal_profiles" (
    "user_id" INTEGER NOT NULL,
    "region" TEXT NOT NULL,
    "character_name" TEXT NOT NULL,
    "character_uuid" TEXT,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "public_fields" JSONB NOT NULL DEFAULT '[]',
    "last_snapshot_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personal_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "personal_snapshots" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "region" TEXT NOT NULL,
    "character_name" TEXT NOT NULL,
    "stats" JSONB NOT NULL DEFAULT '[]',
    "profile" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "personal_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "personal_snapshots_user_id_created_at_idx" ON "personal_snapshots"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "personal_profiles" ADD CONSTRAINT "personal_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
