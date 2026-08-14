-- CreateEnum
CREATE TYPE "CardBackground" AS ENUM ('COLOR', 'AVATAR', 'NONE');

-- CreateEnum
CREATE TYPE "BannerMode" AS ENUM ('COLOR', 'IMAGE', 'NONE');

-- CreateEnum
CREATE TYPE "BannerType" AS ENUM ('BACKGROUND', 'HEADER');

-- CreateEnum
CREATE TYPE "UserLayout" AS ENUM ('CLASSIC', 'MODERN', 'COMPACT');

-- CreateTable
CREATE TABLE "UserCustomization" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "layout" "UserLayout" NOT NULL DEFAULT 'CLASSIC',
    "bannerMode" "BannerMode" NOT NULL DEFAULT 'NONE',
    "bannerType" "BannerType" NOT NULL DEFAULT 'HEADER',
    "bannerColor" TEXT NOT NULL DEFAULT '#171717',
    "bannerImage" TEXT,
    "cardBackground" "CardBackground" NOT NULL DEFAULT 'NONE',
    "cardColor" TEXT NOT NULL DEFAULT '#171717',
    "avatar" "AvatarSource",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserCustomization_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserCustomization_userId_key" ON "UserCustomization"("userId");

-- AddForeignKey
ALTER TABLE "UserCustomization" ADD CONSTRAINT "UserCustomization_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
