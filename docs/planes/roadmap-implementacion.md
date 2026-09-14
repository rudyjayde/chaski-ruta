# Índice de implementación (por complejidad)

**Fecha:** 8 de septiembre de 2026. Ordena todo lo acordado en la
documentación (`DOCUMENTO_MAESTRO_NEGOCIO_Y_PRODUCTO.md` y el resto de
`docs/planes/`) que todavía no está construido en código, de menor a mayor
complejidad. No es un documento de reglas de negocio — para eso están los
demás; este es solo el orden de trabajo. Se actualiza a medida que se
implementa cada bloque.

**Bloque 1.1 completo y con la migración ya aplicada** (Jayde corrió
`npx prisma migrate deploy` + `npx prisma generate` el 8 de septiembre de
2026 — funciona en la base real). **Bloque 1.2 completo en código** (los 6
cambios de cola/viaje/manifiesto, ver más abajo) — compila limpio en backend
y frontend, y se está probando en vivo con datos de prueba de ATIPCAR ahora
mismo (todavía no confirmado del todo — ver notas del bloque). De paso se
agregó una corrección chica encontrada probando: **"Anular viaje"** (admin),
para destrabar un viaje `PROGRAMADO` que el conductor preparó/cerró pero
nunca despachó — migración aplicada y `tsc` limpio en backend y frontend
(9 de septiembre de 2026), completo.

**Bloque 1.3 completo en código, SIN VERIFICAR (9 de septiembre de 2026).**
Escrito sin que Jayde estuviera revisando en vivo (pidió seguir sola con 1.3
y 1.4 mientras descansaba) — no hay `device_bash` en este entorno de trabajo,
así que no se pudo correr `tsc` ni probar en vivo; falta ese paso antes de
confiar en esto. Sin migración nueva (no se guarda la foto como archivo
permanente, ver nota en `digitizeSuggest()`). Ver `ia-aplicada.md` §2.2.

**Bloque 1.4 completo en código, SIN VERIFICAR (9 de septiembre de 2026).**
Mismo caso: sin `tsc` ni prueba en vivo todavía. Sin migración nueva. Ver
`ia-aplicada.md` §2.3. Descubrimiento importante mientras se construía: el
asistente conversacional de `plan-pro.md` §6/§8 (`backend/src/assistant/`)
YA ESTÁ CONSTRUIDO — no es "diseño aprobado, pendiente de implementar" como
decía este documento antes; usa `@anthropic-ai/sdk` con tool calling real y
está gateado a Plan PRO. El resumen diario es una función aparte, sin ese
gate de plan (ia-aplicada.md §4: las funciones de §2 no son exclusivas de
PRO) y con su propio cliente más simple en `backend/src/ai/anthropic.service.ts`
(mismo SDK, sin tool calling — las cifras las calcula Prisma, Claude solo
las redacta, para que "nunca invente una cifra" sea una garantía estructural
y no solo una instrucción de prompt).

**Pendiente antes de dar 1.3 y 1.4 por buenos:**
1. Correr `npx tsc --noEmit -p .` en `backend/` y en la raíz del frontend.
2. Confirmar que `ANTHROPIC_API_KEY` en `backend/.env` es una key real y
   activa (ya estaba configurada — no se tocó — pero nunca se probó una
   llamada real a la API de Claude en este proyecto hasta ahora).
3. Probar en vivo: cerrar un manifiesto con respaldo en papel, subir una
   foto real desde "Completar manifiesto" (conductor) y revisar que la IA
   pre-llene filas razonables; abrir el panel de administrador y confirmar
   que aparece la tarjeta "Resumen del día (IA)".

**Bloque 2.1 completo en código, SIN VERIFICAR (9 de septiembre de 2026).**
Mismo caso: sin `tsc` ni prueba en vivo. Nuevo endpoint
`GET /commercial-requests/:id/triage` (Super Admin) + tarjeta "Resumen
ejecutivo (IA)" arriba del detalle de una solicitud en
`SuperAdminApp.tsx` → Solicitudes comerciales. Igual que 1.4, best-effort
(si Claude falla o no esta configurado, la tarjeta no aparece, el
formulario completo sigue visible abajo tal cual). Ver `ia-aplicada.md` §2.1.

**Pausa aca (9 de septiembre de 2026) a esperar que Jayde verifique 1.3,
1.4 y 2.1** antes de seguir con más bloques de Nivel 2 — son 3 funciones de
IA nuevas sin ni una sola corrida real de `tsc` todavía (sin `device_bash`
en este entorno de trabajo). Pendiente antes de seguir: correr `tsc` en
`backend/` y en la raíz del frontend, y probar en vivo cada una (ver notas
de cada bloque arriba). Próximo bloque sugerido una vez verificado todo lo
anterior: 2.3, asistente de onboarding para nuevas asociaciones (depende de
1.1, que ya está listo) — o 2.2, deteccion de anomalías en recaudación, si
ya hay suficiente histórico de datos reales.

## Nivel 1 — Bajo (cambios acotados sobre código que ya existe)

### 1.1 Solicitud comercial desde la landing — `COMPLETO Y FUNCIONANDO EN LA BASE REAL`
Backend real para el formulario de la landing (antes simulado con
`setTimeout`): modelo `CommercialRequest` en Prisma, endpoint público
`POST /commercial-requests`, notificación por correo (best-effort, mismo
patrón que `sendWelcomeEmail`), y endpoints protegidos para el Super Admin
(`GET /commercial-requests`, `GET /commercial-requests/:id`,
`PATCH /commercial-requests/:id/reviewed`). Con campos fijos (no el
constructor dinámico de preguntas todavía — eso es Nivel 3). Ver
`landing-publica-y-solicitudes-comerciales.md` §3-§5.

Ya construido:
- `backend/prisma/schema.prisma` — modelo `CommercialRequest` + enums
  `CommercialSolution`/`CommercialRequestStatus`, escritos a mano (ver nota
  de migración abajo).
- `backend/prisma/migrations/20260908190000_commercial_requests/migration.sql`
  — SQL de la migración, también escrito a mano.
- `backend/src/commercial-requests/` — DTOs, servicio, controlador y
  módulo completos; registrado en `app.module.ts`.
- `backend/src/mail/mail.service.ts` — `sendCommercialRequestNotification()`.
- `src/lib/commercial-requests-api.ts` — cliente público (sin auth) que
  usa la landing.
- `src/pages/Landing.tsx` — los 3 formularios (Operación, PRO, GPS
  Vehicular) ya envían al backend real en vez de simular con `setTimeout`.
- `src/lib/operacion-api.ts` — `fetchCommercialRequests`,
  `fetchCommercialRequest`, `markCommercialRequestReviewed` para el panel.
- `src/pages/superadmin/SuperAdminApp.tsx` — la pantalla "Solicitudes
  comerciales" (antes con datos de `demo.ts`) ahora lista datos reales y
  permite marcar una solicitud como contactada.

**Migración aplicada.** La CLI de Prisma no pudo ejecutarse desde este
entorno de trabajo (sin acceso a `binaries.prisma.sh` para descargar el
query engine de Linux) — el schema y el SQL de la migración se escribieron
a mano siguiendo el estilo exacto de las migraciones existentes. Jayde
corrió `npx prisma migrate deploy` + `npx prisma generate` desde su propia
terminal el 8 de septiembre de 2026 y confirmó que funcionó — el formulario
de la landing ya guarda solicitudes reales en la base de datos.

### 1.2 Correcciones de cola pendientes desde el 4-8 de septiembre — `IMPLEMENTADO EN CÓDIGO, PENDIENTE DE PRUEBA EN VIVO`
Seis cambios sobre `queues.service.ts`, `queues.module.ts`,
`dto/join-queue.dto.ts`, `operacion-api.ts` y `DriverApp.tsx`:
- Quitar el timeout automático de LLAMANDO (`sweepTimeouts`/`demoteToBack`
  eliminados; una unidad Llamada ya no vence nunca por tiempo, solo por
  acción explícita del conductor o del administrador).
- Restringir `prepareTrip()`/apertura de manifiesto a únicamente LLAMADO.
- Fusionar "Marcar llegada" + "Inscribirme" + "Confirmar llegada" en un
  único paso: `join()` ahora recibe también `lat`/`lng` del celular
  (`JoinQueueDto`), usa la misma fuente de evidencia GPS que antes usaba
  `trips.service.ts → complete()` (hardware Traccar si la unidad lo tiene
  vinculado, si no el GPS del celular), completa el viaje activo en la
  dirección contraria si existía (dentro de la misma transacción, con su
  propia entrada de auditoría `COMPLETAR_VIAJE`), y crea la inscripción ya
  directamente en `INSCRITO` (nunca más en `PREINSCRITO`). El botón
  "Marcar llegada" del Manifiesto en `DriverApp.tsx` se quitó — ahora ese
  cartel manda al conductor a la pestaña Cola a inscribirse, que es lo que
  confirma la llegada. `confirmArrival()` se dejó en el backend y sus
  botones en pantalla solo por compatibilidad con filas `PREINSCRITO` que
  ya existieran de antes del despliegue — ninguna inscripción nueva las usa.
- Reubicaciones: exentas del mínimo de 60 min; el orden en la cola de
  destino ya no se calcula con la hora (irrelevante) del último viaje
  completado en la dirección contraria, sino con la hora real de esta
  misma inscripción verificada.
- Manifiesto vacío por demanda real: no requirió código nuevo,
  `manifests.service.ts → close()` ya lo maneja correctamente (confirmado
  leyendo el código, no solo el plan).
- Quitar cualquier camino de despacho administrativo sin manifiesto:
  `depart()` ya no crea un viaje "desde cero" como atajo — exige que exista
  un viaje `PROGRAMADO` con manifiesto `CERRADO` (ni `BORRADOR` ni ausente).

Compila limpio (`tsc --noEmit`) en `backend/` y en la raíz del frontend.
**Pendiente antes de confiar en esto en producción:** probarlo con
cuidado con las unidades reales de ATIPCAR — este bloque toca el sistema
que usan hoy. Ver `plan-operacion.md` y `plan-flujo-colas-hardware.md` §7.

### 1.3 Digitalización de manifiestos con IA de visión
Sobre la base ya existente de `pendingDigitize`: subir foto, Claude
pre-llena nombres/asientos/tarifas. Ver `ia-aplicada.md` §2.2.

### 1.4 Resumen diario para el gerente (digest)
Tool calling contra datos reales de cola/viajes/manifiestos del día. Ver
`ia-aplicada.md` §2.3. Depende de que 1.2 esté al día para que las cifras
sean correctas.

## Nivel 2 — Medio (módulos nuevos, sin arquitectura nueva)

### 2.1 Triaje automático de solicitudes comerciales
Resumen ejecutivo generado por Claude sobre cada Solicitud comercial (1.1)
para el Super Admin. Depende de 1.1.

### 2.2 Detección de anomalías en recaudación
Comparar recaudación de un vehículo/conductor contra su propio histórico y
marcar caídas fuertes para revisión. Depende de tener datos históricos
suficientes.

### 2.3 Asistente de onboarding para nuevas asociaciones
Ayuda a poblar terminales/rutas al dar de alta una asociación, a partir de
los datos de su Solicitud comercial. Depende de 1.1.

### 2.4 Propuestas de mejora de Plan PRO (`plan-pro.md` §11)
Mantenimiento predictivo, puntaje de conducción, sugerencia de
reubicación, reportes de eficiencia — los cuatro dependen de tener
telemetría PRO real ya integrada (ver Nivel 3, "Integración real con
Traccar").

### 2.5 Formulario administrable (constructor dinámico de preguntas)
La versión con preguntas configurables por el Super Admin, versionado de
respuestas. Extiende 1.1 una vez que esa base esté sólida. Ver
`landing-publica-y-solicitudes-comerciales.md` §8.

### 2.6 Administrador de landing (CMS)
Contenido, tarjetas de planes, SEO, modo mantenimiento, con
borrador/previsualización/publicación/historial. Ver
`landing-publica-y-solicitudes-comerciales.md` §9.

## Nivel 3 — Alto (arquitectura nueva o depende de escala/integraciones externas)

### 3.1 Detección automática de accidentes — `PRIORIDAD 1 entre los proyectos grandes`
Análisis de telemetría PRO en tiempo real (patrón de desaceleración +
impacto + inmovilidad), alerta automática al administrador. Depende de
tener la integración real con Traccar (no existe todavía — hoy PRO es
prototipo de UI). Ver `ia-aplicada.md` §3.1.

### 3.2 Integración real con Traccar (PRO y GPS Vehicular)
Requisito técnico previo para 2.4 y 3.1 — hoy no hay conexión real, es la
brecha más grande de Plan PRO (`plan-pro.md` §10).

### 3.3 Expediente legal/seguros automático ante incidente
Depende de 1.2 (manifiesto/GPS confiables) y 3.2.

### 3.4 Pronóstico de demanda con contexto real
Depende de historial operativo suficiente + una fuente de datos externa
(ferias, feriados, clima) todavía sin elegir.

### 3.5 Mapa de riesgo de ruta
Depende de escala — varias asociaciones con GPS activo simultáneamente.
No tiene sentido con una sola flota chica.

### 3.6 Aplicación nativa en Flutter
Proyecto de frontend completo desde cero. Se construye **al final**, una
vez consolidado todo lo anterior — ver
`plataformas-web-y-app-nativa.md` §3.

## Cómo se usa este índice

Cada bloque se marca `EN CONSTRUCCIÓN`, `LISTO` o se deja sin marca
(pendiente) a medida que se avanza. El orden dentro de cada nivel es
sugerido, no estricto — algunos bloques del mismo nivel no dependen entre
sí y pueden reordenarse según lo que Jayde priorice.
