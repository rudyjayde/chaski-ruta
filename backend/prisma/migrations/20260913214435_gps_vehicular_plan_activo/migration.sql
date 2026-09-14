-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "gpsVehicularActivo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "gpsVehicularVenceEn" TIMESTAMP(3);
