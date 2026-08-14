-- CreateEnum
CREATE TYPE "ClanStatus" AS ENUM ('FROZEN', 'ACTIVE');

-- CreateEnum
CREATE TYPE "StageType" AS ENUM ('RAID', 'EVENT', 'TRAINING', 'OTHER');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');

-- CreateTable
CREATE TABLE "clans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tag" TEXT NOT NULL DEFAULT '',
    "level" INTEGER NOT NULL DEFAULT 0,
    "level_points" INTEGER NOT NULL DEFAULT 0,
    "alliance" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "leader" TEXT NOT NULL DEFAULT '',
    "member_count" INTEGER NOT NULL DEFAULT 0,
    "region" TEXT NOT NULL DEFAULT 'RU',
    "status" "ClanStatus" NOT NULL DEFAULT 'FROZEN',
    "synced_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clan_members" (
    "id" SERIAL NOT NULL,
    "clanId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rank" TEXT NOT NULL DEFAULT '',
    "join_time" TIMESTAMP(3),
    "userId" INTEGER,
    "synced_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clan_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_clan_profile" (
    "userId" INTEGER NOT NULL,
    "clanId" TEXT,
    "region" TEXT NOT NULL DEFAULT 'RU',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_clan_profile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "stage_sessions" (
    "id" SERIAL NOT NULL,
    "external_id" TEXT NOT NULL,
    "region" TEXT NOT NULL DEFAULT 'RU',
    "map_name" TEXT NOT NULL,
    "type" "StageType" NOT NULL DEFAULT 'RAID',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "creatorId" INTEGER NOT NULL,
    "clanId" TEXT,
    "ai_summary" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stage_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stage_screenshots" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "file_path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL DEFAULT 'image/png',
    "size_bytes" INTEGER NOT NULL DEFAULT 0,
    "ai_result" JSONB,
    "ai_status" TEXT NOT NULL DEFAULT 'pending',
    "ai_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stage_screenshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stage_attendance" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "source" TEXT NOT NULL DEFAULT 'ai',
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stage_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_loadout" (
    "userId" INTEGER NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_loadout_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "clan_members_userId_key" ON "clan_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "clan_members_clanId_name_key" ON "clan_members"("clanId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "stage_sessions_external_id_key" ON "stage_sessions"("external_id");

-- CreateIndex
CREATE UNIQUE INDEX "stage_attendance_sessionId_userId_key" ON "stage_attendance"("sessionId", "userId");

-- AddForeignKey
ALTER TABLE "clan_members" ADD CONSTRAINT "clan_members_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clan_members" ADD CONSTRAINT "clan_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_clan_profile" ADD CONSTRAINT "user_clan_profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_clan_profile" ADD CONSTRAINT "user_clan_profile_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "clans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_sessions" ADD CONSTRAINT "stage_sessions_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_sessions" ADD CONSTRAINT "stage_sessions_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "clans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_screenshots" ADD CONSTRAINT "stage_screenshots_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "stage_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_attendance" ADD CONSTRAINT "stage_attendance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "stage_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_attendance" ADD CONSTRAINT "stage_attendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_loadout" ADD CONSTRAINT "user_loadout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
