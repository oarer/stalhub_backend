-- CreateEnum
CREATE TYPE "StarTargetType" AS ENUM ('BUILD', 'ARTICLE');

-- CreateTable
CREATE TABLE "builds" (
    "id" SERIAL NOT NULL,
    "external_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "flags" INTEGER NOT NULL DEFAULT 0,
    "accent_color" TEXT,
    "tags" TEXT NOT NULL DEFAULT '',
    "authorId" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "builds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "articles" (
    "id" SERIAL NOT NULL,
    "external_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "flags" INTEGER NOT NULL DEFAULT 0,
    "accent_color" TEXT,
    "tags" TEXT NOT NULL DEFAULT '',
    "authorId" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_versions" (
    "id" SERIAL NOT NULL,
    "version" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "articleId" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stars" (
    "id" SERIAL NOT NULL,
    "targetType" "StarTargetType" NOT NULL,
    "targetId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stars_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "builds_external_id_key" ON "builds"("external_id");

-- CreateIndex
CREATE UNIQUE INDEX "articles_external_id_key" ON "articles"("external_id");

-- CreateIndex
CREATE UNIQUE INDEX "stars_targetType_targetId_userId_key" ON "stars"("targetType", "targetId", "userId");

-- AddForeignKey
ALTER TABLE "builds" ADD CONSTRAINT "builds_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_versions" ADD CONSTRAINT "article_versions_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stars" ADD CONSTRAINT "stars_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
