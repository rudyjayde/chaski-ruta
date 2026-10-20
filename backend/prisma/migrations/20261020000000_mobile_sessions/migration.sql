-- Sesiones de la app nativa (Flutter, 20 oct 2026): login movil con token de
-- renovacion rotativo, identificador de instalacion y token de push (FCM).
-- Escrita a mano: `migrate dev` intentaba ademas quitar EN_PROGRESO de
-- SupportTicketStatus, que se deja a proposito (ver 20261002000000).

-- CreateEnum
CREATE TYPE "MobilePlatform" AS ENUM ('ANDROID', 'IOS');

-- CreateTable
CREATE TABLE "mobile_sessions" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "platform" "MobilePlatform" NOT NULL,
    "appVersion" TEXT,
    "pushToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "mobile_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mobile_sessions_refreshTokenHash_key" ON "mobile_sessions"("refreshTokenHash");
CREATE INDEX "mobile_sessions_personId_revokedAt_idx" ON "mobile_sessions"("personId", "revokedAt");
CREATE INDEX "mobile_sessions_pushToken_idx" ON "mobile_sessions"("pushToken");

-- AddForeignKey
ALTER TABLE "mobile_sessions" ADD CONSTRAINT "mobile_sessions_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;
