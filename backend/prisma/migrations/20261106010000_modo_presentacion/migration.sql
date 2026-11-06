-- Modo presentacion (6 nov 2026): permite demostrar el sistema lejos de los
-- terminales. Apagado por defecto, asi que ninguna asociacion cambia al aplicarla.
ALTER TABLE "operational_configs" ADD COLUMN "presentationMode" BOOLEAN NOT NULL DEFAULT false;
