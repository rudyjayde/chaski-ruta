-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('SPRINTER', 'HIACE', 'MASTER');

-- CreateEnum
CREATE TYPE "RouteDir" AS ENUM ('JULI_PUNO', 'PUNO_JULI');

-- CreateEnum
CREATE TYPE "VehicleRouteAssignment" AS ENUM ('JULI_PUNO', 'PUNO_JULI', 'AMBAS');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('ACTIVO', 'INACTIVO', 'SUSPENDIDO');

-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('ACTIVA', 'OBSERVADA', 'SUSPENDIDA');

-- CreateEnum
CREATE TYPE "QueueStatus" AS ENUM ('PREINSCRITO', 'INSCRITO', 'LLAMADO', 'EN_TERMINAL', 'EMBARCANDO', 'LISTO', 'SALIO', 'AUSENTE', 'RETIRADO');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('REGISTRO_MOVIL', 'PRESENCIA_TERMINAL', 'VEHICULO_VERIFICADO', 'SIN_EVIDENCIA');

-- CreateEnum
CREATE TYPE "EscapeState" AS ENUM ('NINGUNO', 'ME_INSCRIBO_MAS_TARDE');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('PROGRAMADO', 'ACTIVO', 'COMPLETADO', 'CON_INCIDENCIA');

-- CreateEnum
CREATE TYPE "GpsStatus" AS ENUM ('SIN_GPS', 'REGISTRO_MOVIL', 'GPS_FISICO');

-- CreateEnum
CREATE TYPE "ManifestStatus" AS ENUM ('BORRADOR', 'CERRADO', 'CON_INCIDENCIA', 'CORREGIDO');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('EFECTIVO', 'YAPE', 'PLIN', 'TRANSFERENCIA', 'QR');

-- CreateEnum
CREATE TYPE "Terminal" AS ENUM ('JULI', 'PUNO');

-- CreateEnum
CREATE TYPE "RelocationStatus" AS ENUM ('DETECTADO', 'PROPUESTA', 'AUTORIZADA', 'EN_TRASLADO', 'COMPLETADA');

-- AlterTable
ALTER TABLE "people" ADD COLUMN     "boundDeviceId" TEXT,
ADD COLUMN     "boundDeviceSetAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ruc" TEXT NOT NULL,
    "legalRep" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "CompanyStatus" NOT NULL DEFAULT 'ACTIVA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "vehicleType" "VehicleType" NOT NULL,
    "plate" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "VehicleStatus" NOT NULL DEFAULT 'ACTIVO',
    "routeAssignment" "VehicleRouteAssignment" NOT NULL DEFAULT 'AMBAS',
    "partnerId" TEXT,
    "currentDriverId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_plate_history" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "fromDate" TIMESTAMP(3) NOT NULL,
    "toDate" TIMESTAMP(3),

    CONSTRAINT "vehicle_plate_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operational_configs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "minTripMinutesJuliPuno" INTEGER NOT NULL DEFAULT 90,
    "minTripMinutesPunoJuli" INTEGER NOT NULL DEFAULT 90,
    "gpsRadiusMeters" INTEGER NOT NULL DEFAULT 300,
    "timeoutMinutes" INTEGER NOT NULL DEFAULT 15,
    "anomalySpeedThresholdKmh" INTEGER NOT NULL DEFAULT 100,
    "terminalJuliLat" DOUBLE PRECISION NOT NULL DEFAULT -16.2035,
    "terminalJuliLng" DOUBLE PRECISION NOT NULL DEFAULT -69.4597,
    "terminalPunoLat" DOUBLE PRECISION NOT NULL DEFAULT -15.8402,
    "terminalPunoLng" DOUBLE PRECISION NOT NULL DEFAULT -70.0219,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operational_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "queue_entries" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "route" "RouteDir" NOT NULL,
    "position" INTEGER NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "status" "QueueStatus" NOT NULL DEFAULT 'PREINSCRITO',
    "evidence" "EvidenceType" NOT NULL DEFAULT 'SIN_EVIDENCIA',
    "deviceId" TEXT,
    "arrivalGpsLat" DOUBLE PRECISION,
    "arrivalGpsLng" DOUBLE PRECISION,
    "arrivalCheckedAt" TIMESTAMP(3),
    "chainDepartureAt" TIMESTAMP(3),
    "escapeState" "EscapeState" NOT NULL DEFAULT 'NINGUNO',
    "timeoutAt" TIMESTAMP(3),
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "queue_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trips" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "route" "RouteDir" NOT NULL,
    "status" "TripStatus" NOT NULL DEFAULT 'PROGRAMADO',
    "scheduledDeparture" TIMESTAMP(3),
    "actualDeparture" TIMESTAMP(3),
    "scheduledArrival" TIMESTAMP(3),
    "actualArrival" TIMESTAMP(3),
    "gpsStatus" "GpsStatus" NOT NULL DEFAULT 'SIN_GPS',
    "incidentNote" TEXT,
    "predecessorTripId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manifests" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "ManifestStatus" NOT NULL DEFAULT 'BORRADOR',
    "route" "RouteDir" NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "operatorId" TEXT,
    "tripId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "departureTime" TEXT NOT NULL,
    "arrivalTime" TEXT,
    "capacity" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "correctionReason" TEXT,
    "pdfGenerated" BOOLEAN NOT NULL DEFAULT false,
    "paperBackup" BOOLEAN NOT NULL DEFAULT false,
    "pendingDigitize" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manifests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "passengers" (
    "id" TEXT NOT NULL,
    "manifestId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dni" TEXT NOT NULL,
    "seat" INTEGER NOT NULL,
    "fare" DOUBLE PRECISION NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,

    CONSTRAINT "passengers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relocation_orders" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" "RelocationStatus" NOT NULL DEFAULT 'DETECTADO',
    "fromTerminal" "Terminal" NOT NULL,
    "toTerminal" "Terminal" NOT NULL,
    "reason" TEXT NOT NULL,
    "windowLabel" TEXT NOT NULL,
    "compensation" TEXT NOT NULL,
    "internalOrder" TEXT NOT NULL,
    "confirmedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "relocation_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relocation_units" (
    "id" TEXT NOT NULL,
    "relocationOrderId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "accepted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "relocation_units_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "companies_organizationId_idx" ON "companies"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "companies_organizationId_ruc_key" ON "companies"("organizationId", "ruc");

-- CreateIndex
CREATE INDEX "vehicles_organizationId_idx" ON "vehicles"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_organizationId_code_key" ON "vehicles"("organizationId", "code");

-- CreateIndex
CREATE INDEX "vehicle_plate_history_vehicleId_idx" ON "vehicle_plate_history"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "operational_configs_organizationId_key" ON "operational_configs"("organizationId");

-- CreateIndex
CREATE INDEX "queue_entries_organizationId_route_position_idx" ON "queue_entries"("organizationId", "route", "position");

-- CreateIndex
CREATE UNIQUE INDEX "queue_entries_organizationId_route_vehicleId_key" ON "queue_entries"("organizationId", "route", "vehicleId");

-- CreateIndex
CREATE INDEX "trips_organizationId_route_status_idx" ON "trips"("organizationId", "route", "status");

-- CreateIndex
CREATE UNIQUE INDEX "manifests_number_key" ON "manifests"("number");

-- CreateIndex
CREATE UNIQUE INDEX "manifests_tripId_key" ON "manifests"("tripId");

-- CreateIndex
CREATE INDEX "manifests_organizationId_idx" ON "manifests"("organizationId");

-- CreateIndex
CREATE INDEX "passengers_manifestId_idx" ON "passengers"("manifestId");

-- CreateIndex
CREATE UNIQUE INDEX "relocation_orders_internalOrder_key" ON "relocation_orders"("internalOrder");

-- CreateIndex
CREATE INDEX "relocation_orders_organizationId_idx" ON "relocation_orders"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "relocation_units_relocationOrderId_vehicleId_key" ON "relocation_units"("relocationOrderId", "vehicleId");

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_currentDriverId_fkey" FOREIGN KEY ("currentDriverId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_plate_history" ADD CONSTRAINT "vehicle_plate_history_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operational_configs" ADD CONSTRAINT "operational_configs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_predecessorTripId_fkey" FOREIGN KEY ("predecessorTripId") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manifests" ADD CONSTRAINT "manifests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manifests" ADD CONSTRAINT "manifests_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manifests" ADD CONSTRAINT "manifests_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manifests" ADD CONSTRAINT "manifests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manifests" ADD CONSTRAINT "manifests_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manifests" ADD CONSTRAINT "manifests_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passengers" ADD CONSTRAINT "passengers_manifestId_fkey" FOREIGN KEY ("manifestId") REFERENCES "manifests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relocation_orders" ADD CONSTRAINT "relocation_orders_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relocation_orders" ADD CONSTRAINT "relocation_orders_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relocation_units" ADD CONSTRAINT "relocation_units_relocationOrderId_fkey" FOREIGN KEY ("relocationOrderId") REFERENCES "relocation_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relocation_units" ADD CONSTRAINT "relocation_units_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
