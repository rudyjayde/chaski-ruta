-- DropIndex
DROP INDEX "passenger_profiles_organizationId_dni_key";

-- AlterTable
ALTER TABLE "complaint_book_entries" ADD COLUMN     "consumerDocumentType" TEXT;

-- AlterTable
ALTER TABLE "passenger_profiles" ADD COLUMN     "documentType" TEXT NOT NULL DEFAULT 'DNI';

-- AlterTable
ALTER TABLE "passengers" ADD COLUMN     "documentType" TEXT NOT NULL DEFAULT 'DNI';

-- AlterTable
ALTER TABLE "people" ADD COLUMN     "licenseIssuedAt" DATE;

-- CreateIndex
CREATE UNIQUE INDEX "passenger_profiles_organizationId_documentType_dni_key" ON "passenger_profiles"("organizationId", "documentType", "dni");

