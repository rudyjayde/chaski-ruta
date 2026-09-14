-- CreateEnum
CREATE TYPE "CommercialSolution" AS ENUM ('OPERACION', 'PRO', 'GPS_VEHICULAR');

-- CreateEnum
CREATE TYPE "CommercialRequestStatus" AS ENUM ('NUEVA', 'CONTACTADA', 'COTIZADA', 'CONVERTIDA', 'DESCARTADA');

-- CreateTable
CREATE TABLE "commercial_requests" (
    "id" TEXT NOT NULL,
    "solution" "CommercialSolution" NOT NULL,
    "status" "CommercialRequestStatus" NOT NULL DEFAULT 'NUEVA',
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,
    "orgName" TEXT,
    "ruc" TEXT,
    "answers" JSONB NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commercial_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "commercial_requests_status_createdAt_idx" ON "commercial_requests"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "commercial_requests" ADD CONSTRAINT "commercial_requests_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;
