-- CreateEnum
CREATE TYPE "ComplaintType" AS ENUM ('RECLAMO', 'QUEJA');

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('RECIBIDO', 'EN_PROCESO', 'RESPONDIDO');

-- CreateTable
CREATE TABLE "complaint_book_entries" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "type" "ComplaintType" NOT NULL,
    "consumerName" TEXT NOT NULL,
    "consumerDocument" TEXT NOT NULL,
    "consumerAddress" TEXT,
    "consumerEmail" TEXT NOT NULL,
    "consumerPhone" TEXT,
    "isMinor" BOOLEAN NOT NULL DEFAULT false,
    "guardianName" TEXT,
    "serviceDescription" TEXT NOT NULL,
    "claimedAmount" DOUBLE PRECISION,
    "detail" TEXT NOT NULL,
    "consumerRequest" TEXT NOT NULL,
    "status" "ComplaintStatus" NOT NULL DEFAULT 'RECIBIDO',
    "providerResponse" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "complaint_book_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "complaint_book_entries_number_key" ON "complaint_book_entries"("number");

-- CreateIndex
CREATE INDEX "complaint_book_entries_status_createdAt_idx" ON "complaint_book_entries"("status", "createdAt");
