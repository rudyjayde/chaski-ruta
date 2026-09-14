-- CreateEnum
CREATE TYPE "HealthCheckService" AS ENUM ('BASE_DE_DATOS', 'TRACCAR', 'NOTIFICACIONES');

-- CreateEnum
CREATE TYPE "HealthCheckStatus" AS ENUM ('OK', 'DEGRADADO', 'CAIDO');

-- CreateTable
CREATE TABLE "health_check_logs" (
    "id" TEXT NOT NULL,
    "service" "HealthCheckService" NOT NULL,
    "status" "HealthCheckStatus" NOT NULL,
    "latencyMs" INTEGER,
    "errorMessage" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_check_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "health_check_logs_service_checkedAt_idx" ON "health_check_logs"("service", "checkedAt");
