-- CreateEnum
CREATE TYPE "GpsAlertType" AS ENUM ('DESCONEXION', 'MOVIMIENTO_SIN_VIAJE');

-- CreateEnum
CREATE TYPE "GpsAlertStatus" AS ENUM ('NUEVA', 'EN_REVISION', 'REVISADA', 'DESCARTADA');

-- CreateTable
CREATE TABLE "gps_alerts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "type" "GpsAlertType" NOT NULL,
    "status" "GpsAlertStatus" NOT NULL DEFAULT 'NUEVA',
    "description" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "reviewNote" TEXT,

    CONSTRAINT "gps_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gps_alerts_organizationId_status_idx" ON "gps_alerts"("organizationId", "status");

-- CreateIndex
CREATE INDEX "gps_alerts_vehicleId_type_status_idx" ON "gps_alerts"("vehicleId", "type", "status");

-- AddForeignKey
ALTER TABLE "gps_alerts" ADD CONSTRAINT "gps_alerts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gps_alerts" ADD CONSTRAINT "gps_alerts_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
