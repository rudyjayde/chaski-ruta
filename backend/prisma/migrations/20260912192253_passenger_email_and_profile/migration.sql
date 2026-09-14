-- AlterTable
ALTER TABLE "passengers" ADD COLUMN     "email" TEXT;

-- CreateTable
CREATE TABLE "passenger_profiles" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dni" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "tripCount" INTEGER NOT NULL DEFAULT 0,
    "lastTripAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "passenger_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "passenger_profiles_organizationId_idx" ON "passenger_profiles"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "passenger_profiles_organizationId_dni_key" ON "passenger_profiles"("organizationId", "dni");

-- AddForeignKey
ALTER TABLE "passenger_profiles" ADD CONSTRAINT "passenger_profiles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
