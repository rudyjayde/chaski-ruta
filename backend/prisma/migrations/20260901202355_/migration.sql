/*
  Warnings:

  - A unique constraint covering the columns `[traccarDeviceId]` on the table `vehicles` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "traccarDeviceId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_traccarDeviceId_key" ON "vehicles"("traccarDeviceId");
