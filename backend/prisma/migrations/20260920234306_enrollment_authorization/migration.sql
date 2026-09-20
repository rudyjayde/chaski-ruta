-- CreateEnum
CREATE TYPE "EnrollmentAuthType" AS ENUM ('SIN_HISTORIAL', 'NO_COINCIDE');

-- CreateEnum
CREATE TYPE "EnrollmentAuthStatus" AS ENUM ('PENDIENTE', 'AUTORIZADO', 'RECHAZADO', 'CONSUMIDO', 'EXPIRADO');

-- AlterTable
ALTER TABLE "operational_configs" ADD COLUMN     "enrollmentAuthRequired" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "enrollment_auth_requests" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "route" "RouteDir" NOT NULL,
    "requestedById" TEXT NOT NULL,
    "type" "EnrollmentAuthType" NOT NULL,
    "status" "EnrollmentAuthStatus" NOT NULL DEFAULT 'PENDIENTE',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionReason" TEXT,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrollment_auth_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "enrollment_auth_requests_organizationId_status_idx" ON "enrollment_auth_requests"("organizationId", "status");

-- CreateIndex
CREATE INDEX "enrollment_auth_requests_vehicleId_route_status_idx" ON "enrollment_auth_requests"("vehicleId", "route", "status");

-- AddForeignKey
ALTER TABLE "enrollment_auth_requests" ADD CONSTRAINT "enrollment_auth_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_auth_requests" ADD CONSTRAINT "enrollment_auth_requests_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_auth_requests" ADD CONSTRAINT "enrollment_auth_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_auth_requests" ADD CONSTRAINT "enrollment_auth_requests_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;
