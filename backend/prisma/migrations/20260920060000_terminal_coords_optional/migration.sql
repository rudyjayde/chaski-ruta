-- AlterTable
ALTER TABLE "operational_configs"
  ALTER COLUMN "terminalOriginLat" DROP NOT NULL,
  ALTER COLUMN "terminalOriginLat" DROP DEFAULT,
  ALTER COLUMN "terminalOriginLng" DROP NOT NULL,
  ALTER COLUMN "terminalOriginLng" DROP DEFAULT,
  ALTER COLUMN "terminalDestinationLat" DROP NOT NULL,
  ALTER COLUMN "terminalDestinationLat" DROP DEFAULT,
  ALTER COLUMN "terminalDestinationLng" DROP NOT NULL,
  ALTER COLUMN "terminalDestinationLng" DROP DEFAULT;
