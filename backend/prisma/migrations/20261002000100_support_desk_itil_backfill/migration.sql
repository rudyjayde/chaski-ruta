-- Mesa de servicio ITIL 4 -- paso 2 de 2. Rellena los tickets YA EXISTENTES con valores por
-- defecto razonables (ningun ticket se borra ni pierde subject/message/response/respondedAt):
--   type=INCIDENTE, category=OTRO, impact=MEDIO, urgency=MEDIA -> priority=P2 (misma matriz que
--   usa el servidor), SLA de P2 (2h respuesta / 24h resolucion, en minutos), code correlativo
--   TCK-0001.. por orden de creacion. Los que estaban EN_PROGRESO pasan a EN_ANALISIS (equivalente
--   mas cercano al modelo nuevo).

UPDATE "support_tickets" SET "status" = 'EN_ANALISIS' WHERE "status" = 'EN_PROGRESO';

WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt" ASC) AS rn
  FROM "support_tickets"
)
UPDATE "support_tickets" t
SET
  "code" = 'TCK-' || LPAD(numbered.rn::text, 4, '0'),
  "type" = 'INCIDENTE',
  "category" = 'OTRO',
  "impact" = 'MEDIO',
  "urgency" = 'MEDIA',
  "priority" = 'P2',
  "slaResponseMin" = 120,
  "slaResolutionMin" = 1440,
  -- Un ticket que ya tenia respondedAt (el admin ya lo atendio bajo el modelo viejo) cuenta como
  -- su primera respuesta real; uno que seguia ABIERTO sin respuesta, sigue sin firstResponseAt.
  "firstResponseAt" = t."respondedAt",
  "resolvedAt" = CASE WHEN t."status" = 'RESUELTO' THEN t."respondedAt" ELSE NULL END
FROM numbered
WHERE t."id" = numbered."id";

ALTER TABLE "support_tickets"
  ALTER COLUMN "code" SET NOT NULL,
  ALTER COLUMN "type" SET NOT NULL,
  ALTER COLUMN "category" SET NOT NULL,
  ALTER COLUMN "impact" SET NOT NULL,
  ALTER COLUMN "urgency" SET NOT NULL,
  ALTER COLUMN "priority" SET NOT NULL;

CREATE UNIQUE INDEX "support_tickets_code_key" ON "support_tickets"("code");
