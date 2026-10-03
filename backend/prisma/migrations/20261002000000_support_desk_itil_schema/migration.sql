-- Mesa de servicio ITIL 4 (OE4 tesis, 2 oct 2026) -- paso 1 de 2.
-- Solo agrega tipos y columnas NULAS; nada usa todavia los valores de enum nuevos
-- (Postgres no permite usar un valor de enum en la MISMA transaccion en que se crea).
-- El paso 2 (20261002000100) rellena los tickets existentes y recien ahi exige NOT NULL.

-- CreateEnum
CREATE TYPE "SupportTicketType" AS ENUM ('INCIDENTE', 'SOLICITUD');
CREATE TYPE "SupportTicketCategory" AS ENUM ('ACCESO', 'COLA', 'MANIFIESTO', 'GPS', 'ASISTENTE_IA', 'REPORTES', 'OTRO');
CREATE TYPE "SupportTicketImpact" AS ENUM ('ALTO', 'MEDIO', 'BAJO');
CREATE TYPE "SupportTicketUrgency" AS ENUM ('ALTA', 'MEDIA', 'BAJA');
CREATE TYPE "SupportTicketPriority" AS ENUM ('P1', 'P2', 'P3', 'P4');
CREATE TYPE "SupportLevel" AS ENUM ('N1', 'N2', 'N3');
CREATE TYPE "ProblemStatus" AS ENUM ('REGISTRADO', 'EN_INVESTIGACION', 'ERROR_CONOCIDO', 'EN_SOLUCION', 'CERRADO');

-- AlterEnum (EN_PROGRESO se deja en el tipo a proposito -- Postgres no permite quitar un valor de
-- enum sin recrear el tipo; los tickets que lo usaban se pasan a EN_ANALISIS en el paso 2, y
-- ningun codigo nuevo vuelve a escribir EN_PROGRESO otra vez)
ALTER TYPE "SupportTicketStatus" ADD VALUE 'EN_ANALISIS';
ALTER TYPE "SupportTicketStatus" ADD VALUE 'ESCALADO';
ALTER TYPE "SupportTicketStatus" ADD VALUE 'EN_ESPERA';
ALTER TYPE "SupportTicketStatus" ADD VALUE 'CERRADO';

-- CreateTable
CREATE TABLE "problem_records" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "rootCause" TEXT,
    "workaround" TEXT,
    "knownError" BOOLEAN NOT NULL DEFAULT false,
    "proposedSolution" TEXT,
    "rfcRef" TEXT,
    "status" "ProblemStatus" NOT NULL DEFAULT 'REGISTRADO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "problem_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "problem_records_code_key" ON "problem_records"("code");
CREATE INDEX "problem_records_status_idx" ON "problem_records"("status");

-- AlterTable: columnas nuevas de support_tickets, todas nulas por ahora (se backfillean en el paso 2)
ALTER TABLE "support_tickets"
  ADD COLUMN "code" TEXT,
  ADD COLUMN "type" "SupportTicketType",
  ADD COLUMN "category" "SupportTicketCategory",
  ADD COLUMN "impact" "SupportTicketImpact",
  ADD COLUMN "urgency" "SupportTicketUrgency",
  ADD COLUMN "priority" "SupportTicketPriority",
  ADD COLUMN "supportLevel" "SupportLevel" NOT NULL DEFAULT 'N1',
  ADD COLUMN "assigneeName" TEXT,
  ADD COLUMN "firstResponseAt" TIMESTAMP(3),
  ADD COLUMN "resolvedAt" TIMESTAMP(3),
  ADD COLUMN "closedAt" TIMESTAMP(3),
  ADD COLUMN "resolution" TEXT,
  ADD COLUMN "evidenceUrl" TEXT,
  ADD COLUMN "slaResponseMin" INTEGER,
  ADD COLUMN "slaResolutionMin" INTEGER,
  ADD COLUMN "problemId" TEXT,
  ADD COLUMN "rfcRef" TEXT;

ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "problem_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "support_tickets_priority_status_idx" ON "support_tickets"("priority", "status");
