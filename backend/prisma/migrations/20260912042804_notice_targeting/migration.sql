-- AlterTable
ALTER TABLE "notices" ADD COLUMN     "readAt" TIMESTAMP(3),
ADD COLUMN     "targetPersonId" TEXT;

-- CreateIndex
CREATE INDEX "notices_targetPersonId_readAt_idx" ON "notices"("targetPersonId", "readAt");

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_targetPersonId_fkey" FOREIGN KEY ("targetPersonId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;
