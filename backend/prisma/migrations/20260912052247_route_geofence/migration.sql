-- AlterEnum
ALTER TYPE "GpsAlertType" ADD VALUE 'FUERA_DE_RUTA';

-- CreateTable
CREATE TABLE "route_geofences" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "points" JSONB NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "route_geofences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "route_geofences_organizationId_key" ON "route_geofences"("organizationId");

-- AddForeignKey
ALTER TABLE "route_geofences" ADD CONSTRAINT "route_geofences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
