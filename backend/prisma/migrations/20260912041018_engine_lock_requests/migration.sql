-- CreateEnum
CREATE TYPE "EngineLockStatus" AS ENUM ('SOLICITADO', 'CONFIRMADO', 'EJECUTADO', 'CANCELADO', 'RESTAURADO');

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "engineLocked" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "engine_lock_requests" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "status" "EngineLockStatus" NOT NULL DEFAULT 'SOLICITADO',
    "requestedById" TEXT NOT NULL,
    "requestReason" TEXT NOT NULL,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "stopCandidateSince" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "restoredById" TEXT,
    "restoredAt" TIMESTAMP(3),
    "restoreReason" TEXT,
    "cancelledById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "engine_lock_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "engine_lock_requests_organizationId_status_idx" ON "engine_lock_requests"("organizationId", "status");

-- CreateIndex
CREATE INDEX "engine_lock_requests_vehicleId_status_idx" ON "engine_lock_requests"("vehicleId", "status");

-- AddForeignKey
ALTER TABLE "engine_lock_requests" ADD CONSTRAINT "engine_lock_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engine_lock_requests" ADD CONSTRAINT "engine_lock_requests_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
