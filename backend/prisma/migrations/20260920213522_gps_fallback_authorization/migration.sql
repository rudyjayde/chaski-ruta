-- CreateEnum
CREATE TYPE "GpsFallbackStatus" AS ENUM ('PENDIENTE', 'AUTORIZADO', 'RECHAZADO', 'EXPIRADO');

-- AlterTable
ALTER TABLE "operational_configs" ADD COLUMN     "gpsMaxAgeMinutes" INTEGER NOT NULL DEFAULT 5;

-- CreateTable
CREATE TABLE "gps_fallback_requests" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "status" "GpsFallbackStatus" NOT NULL DEFAULT 'PENDIENTE',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "authorizedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gps_fallback_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gps_fallback_requests_organizationId_status_idx" ON "gps_fallback_requests"("organizationId", "status");

-- CreateIndex
CREATE INDEX "gps_fallback_requests_vehicleId_status_idx" ON "gps_fallback_requests"("vehicleId", "status");

-- AddForeignKey
ALTER TABLE "gps_fallback_requests" ADD CONSTRAINT "gps_fallback_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gps_fallback_requests" ADD CONSTRAINT "gps_fallback_requests_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gps_fallback_requests" ADD CONSTRAINT "gps_fallback_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gps_fallback_requests" ADD CONSTRAINT "gps_fallback_requests_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;
