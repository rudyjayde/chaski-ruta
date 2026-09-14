-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "lastServiceAt" TIMESTAMP(3),
ADD COLUMN     "lastServiceKm" DOUBLE PRECISION,
ADD COLUMN     "serviceIntervalKm" DOUBLE PRECISION;
