/*
  Warnings:

  - You are about to drop the column `minTripMinutesJuliPuno` on the `operational_configs` table. All the data in the column will be lost.
  - You are about to drop the column `minTripMinutesPunoJuli` on the `operational_configs` table. All the data in the column will be lost.
  - You are about to drop the column `terminalJuliLat` on the `operational_configs` table. All the data in the column will be lost.
  - You are about to drop the column `terminalJuliLng` on the `operational_configs` table. All the data in the column will be lost.
  - You are about to drop the column `terminalPunoLat` on the `operational_configs` table. All the data in the column will be lost.
  - You are about to drop the column `terminalPunoLng` on the `operational_configs` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "operational_configs" DROP COLUMN "minTripMinutesJuliPuno",
DROP COLUMN "minTripMinutesPunoJuli",
DROP COLUMN "terminalJuliLat",
DROP COLUMN "terminalJuliLng",
DROP COLUMN "terminalPunoLat",
DROP COLUMN "terminalPunoLng",
ADD COLUMN     "minTripMinutesOutbound" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN     "minTripMinutesReturn" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN     "terminalDestinationAddress" TEXT,
ADD COLUMN     "terminalDestinationLat" DOUBLE PRECISION NOT NULL DEFAULT -15.8402,
ADD COLUMN     "terminalDestinationLng" DOUBLE PRECISION NOT NULL DEFAULT -70.0219,
ADD COLUMN     "terminalDestinationName" TEXT NOT NULL DEFAULT 'Puno',
ADD COLUMN     "terminalOriginAddress" TEXT,
ADD COLUMN     "terminalOriginLat" DOUBLE PRECISION NOT NULL DEFAULT -16.2035,
ADD COLUMN     "terminalOriginLng" DOUBLE PRECISION NOT NULL DEFAULT -69.4597,
ADD COLUMN     "terminalOriginName" TEXT NOT NULL DEFAULT 'Juli';
