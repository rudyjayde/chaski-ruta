-- CreateEnum
CREATE TYPE "NoticeAudience" AS ENUM ('CONDUCTORES', 'SOCIOS', 'AMBOS');

-- CreateTable
CREATE TABLE "notices" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" "NoticeAudience" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notices_organizationId_createdAt_idx" ON "notices"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
