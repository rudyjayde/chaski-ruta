-- Mantis 3017 (6 nov 2026): cada cola (asociacion + ruta) tiene una sola unidad
-- LLAMADO, la que esta llenando pasajeros. Indice parcial: Prisma no lo puede
-- declarar en schema.prisma, por eso solo existe aqui.
--
-- Si en este momento ya hubiera dos unidades LLAMADO en una misma cola, esta
-- migracion falla sin cambiar nada: hay que decidir a mano cual sigue llamando.

CREATE UNIQUE INDEX "queue_entries_un_llamado_por_cola"
  ON "queue_entries" ("organizationId", "route")
  WHERE "status" = 'LLAMADO';
