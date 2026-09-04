-- CreateEnum
CREATE TYPE "DelayedRegistrationStatus" AS ENUM ('PENDIENTE', 'AUTORIZADO', 'RESUELTO');

-- CreateEnum
CREATE TYPE "DelayedRegistrationResolution" AS ENUM ('LLAMAR_PREDECESOR', 'AUTORIZAR_DIRECTO');

-- CreateTable
CREATE TABLE "delayed_registration_requests" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "route" "RouteDir" NOT NULL,
    "requestingVehicleId" TEXT NOT NULL,
    "blockedByVehicleId" TEXT,
    "status" "DelayedRegistrationStatus" NOT NULL DEFAULT 'PENDIENTE',
    "resolution" "DelayedRegistrationResolution",
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delayed_registration_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "delayed_registration_requests_organizationId_status_idx" ON "delayed_registration_requests"("organizationId", "status");

-- AddForeignKey
ALTER TABLE "delayed_registration_requests" ADD CONSTRAINT "delayed_registration_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delayed_registration_requests" ADD CONSTRAINT "delayed_registration_requests_requestingVehicleId_fkey" FOREIGN KEY ("requestingVehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delayed_registration_requests" ADD CONSTRAINT "delayed_registration_requests_blockedByVehicleId_fkey" FOREIGN KEY ("blockedByVehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delayed_registration_requests" ADD CONSTRAINT "delayed_registration_requests_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;
