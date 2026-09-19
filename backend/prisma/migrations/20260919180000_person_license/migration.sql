-- AlterTable
ALTER TABLE "people" ADD COLUMN     "license" TEXT,
ADD COLUMN     "licenseCategory" TEXT,
ADD COLUMN     "licenseExpiry" DATE;

-- CreateIndex
CREATE UNIQUE INDEX "people_license_key" ON "people"("license");
