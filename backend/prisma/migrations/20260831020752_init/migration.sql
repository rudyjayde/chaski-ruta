-- CreateEnum
CREATE TYPE "OrgStatus" AS ENUM ('ACTIVA', 'EN_CONFIGURACION', 'SUSPENDIDA', 'CON_INCIDENCIA');

-- CreateEnum
CREATE TYPE "OrgPlan" AS ENUM ('OPERACION', 'PRO');

-- CreateEnum
CREATE TYPE "PersonRole" AS ENUM ('SUPERADMIN', 'ADMINISTRADOR', 'SOCIO', 'CONDUCTOR');

-- CreateEnum
CREATE TYPE "PersonStatus" AS ENUM ('ACTIVO', 'PENDIENTE', 'SUSPENDIDO');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ruc" TEXT NOT NULL,
    "status" "OrgStatus" NOT NULL DEFAULT 'EN_CONFIGURACION',
    "plan" "OrgPlan" NOT NULL DEFAULT 'OPERACION',
    "driverLiveMapEnabled" BOOLEAN NOT NULL DEFAULT false,
    "whatsappAssistantEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "people" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "dni" TEXT,
    "phone" TEXT,
    "role" "PersonRole" NOT NULL,
    "status" "PersonStatus" NOT NULL DEFAULT 'PENDIENTE',
    "googleId" TEXT,
    "googleEmailVerifiedAt" TIMESTAMP(3),
    "whatsappPhone" TEXT,
    "code" TEXT,
    "company" TEXT,
    "linkedUnit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_entries" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "before" TEXT,
    "after" TEXT,
    "reason" TEXT,
    "evidence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_ruc_key" ON "organizations"("ruc");

-- CreateIndex
CREATE UNIQUE INDEX "people_email_key" ON "people"("email");

-- CreateIndex
CREATE UNIQUE INDEX "people_googleId_key" ON "people"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "people_whatsappPhone_key" ON "people"("whatsappPhone");

-- CreateIndex
CREATE INDEX "people_organizationId_idx" ON "people"("organizationId");

-- CreateIndex
CREATE INDEX "audit_entries_organizationId_idx" ON "audit_entries"("organizationId");

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_entries" ADD CONSTRAINT "audit_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_entries" ADD CONSTRAINT "audit_entries_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;
