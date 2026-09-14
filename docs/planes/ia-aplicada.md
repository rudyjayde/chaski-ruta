# IA aplicada al negocio de CHASKI RUTA

**Fecha de esta versión:** 8 de septiembre de 2026 — **actualizado el 9 de
septiembre de 2026** con el estado real verificado contra el código, y de
nuevo **actualizado el 10 de septiembre de 2026** tras reverificar contra el
código: el asistente conversacional (`plan-pro.md` §6/§8, ver §5 más abajo)
ya tiene pantalla propia y la anomalía de recaudación (§2.4) ya se ve
reflejada en `ManifestsPage.tsx` — ambas cosas que el 9 de septiembre
seguían pendientes. Ya no aplica un solo estado a todo el documento: cada
función de la sección 2 lleva ahora su propia etiqueta (`CONSTRUIDO E
IMPLEMENTADO`, `PENDIENTE DE DECISIÓN`, etc.) — ver detalle en cada
subsección y el resumen en §5. Complementa a `plan-pro.md` (que además
tiene sus propias 4 propuestas de mejora, ver §11 de ese documento).

## 1. Principio rector

En todo lo que sigue, la IA **sugiere, resume o pre-llena — nunca decide,
sanciona ni activa nada por su cuenta.** Es el mismo principio que ya rige
cola, GPS y el asistente conversacional ("una alerta es evidencia para
revisión, no una condena automática" — `plan-pro.md` §2), extendido al resto
del negocio en vez de inventar uno nuevo. Ninguna propuesta de este
documento reemplaza una decisión del administrador, del Super Admin o del
conductor.

## 2. Funciones de IA transversales al negocio

Estado verificado contra el código el 9 de septiembre de 2026 — ver
etiqueta en cada subsección, ya no un estado único para todas.

### 2.1 Triaje automático de solicitudes comerciales — `CONSTRUIDO E IMPLEMENTADO`

Cuando llega una Solicitud comercial desde la landing (ver
`landing-publica-y-solicitudes-comerciales.md` §5), Claude puede leer el
formulario y generar al Super Admin un resumen ejecutivo antes de la
llamada: por ejemplo, "asociación con 40 vehículos, 3 empresas, corredor de
2 horas, pide PRO por control de flota — prioridad alta por tamaño". No
cambia el flujo comercial ya definido — nadie se activa automáticamente,
solo se acelera la evaluación del Super Admin.

**Implementado en:** `backend/src/commercial-requests/commercial-requests.service.ts#triage()`
(usa el wrapper generico `AnthropicService.textComplete()`), conectado en
la pantalla de Solicitudes comerciales de Super Admin
(`fetchCommercialRequestTriage()`).

### 2.2 Digitalización de manifiestos en papel con visión — `CONSTRUIDO E IMPLEMENTADO`

Cuando un manifiesto queda "pendiente de digitalizar" por respaldo físico en
papel —por una reubicación o por demanda real de pasajeros sin tiempo de
registrar a todos antes de marcar salida, ver `plan-operacion.md` §3.8—, el
conductor o administrador sube la foto y Claude pre-llena los campos
(nombres, asientos, tarifas) para que solo se confirmen, en vez de tipear
todo de cero. Esta digitalización es una acción separada de "preparar" el
manifiesto: se hace después, sobre uno ya cerrado, sin que el vehículo
tenga que seguir LLAMANDO (aclarado el 8 de septiembre de 2026, cuando se
confirmó que la restricción de LLAMANDO aplica solo a preparar un
manifiesto nuevo, no a completar uno pendiente de digitalizar).

**Implementado en:** `backend/src/manifests/manifests.service.ts`
(`digitizeSuggest`/`digitize`, sobre `AnthropicService.visionExtract()`) +
pantalla "Digitalizar con foto (IA)" en `DriverApp.tsx`. Corregido el 9 de
septiembre de 2026: antes el flujo de "respaldo en papel" (el que activa
`pendingDigitize`) solo se ofrecía con el manifiesto en 0 pasajeros: un
cierre parcial (1, 2, o cualquier número por debajo de la capacidad) se
iba por el cierre normal y esta pantalla nunca llegaba a aparecer, aunque
el backend ya soportaba el cierre parcial con respaldo en papel desde el
3 de septiembre. También se quitó `capture="environment"` del input de
foto para que el selector nativo ofrezca cámara y galería, no solo cámara.

### 2.3 Resumen diario automático para el gerente — `CONSTRUIDO E IMPLEMENTADO`

Un digest generado por Claude, por ejemplo al abrir el panel o una vez al
día: "Hoy salieron 14 vueltas, 2 inscripciones retrasadas resueltas, la
unidad 003 tuvo una alerta de velocidad." Usa function/tool calling contra
datos reales — mismo patrón ya aprobado para el asistente conversacional;
nunca inventa una cifra.

**Implementado en:** `backend/src/digest/digest.service.ts` (`computeFacts()`
calcula todo con Prisma de forma determinista; `writeSummary()` solo redacta
en prosa esos datos ya calculados, best-effort — si Claude falla, el panel
sigue mostrando `facts` directamente), conectado en `OperationsCenter.tsx`
del panel de administrador (`fetchDailyDigest()`).

### 2.4 Detección de anomalías en recaudación — `CONSTRUIDO E IMPLEMENTADO`

Si un vehículo o conductor reporta de golpe una caída fuerte de ingresos
frente a su propio historial, se marca como algo a revisar — nunca como una
acusación. Mismo espíritu que el puntaje de conducción de `plan-pro.md`
§11.2: evidencia para el gerente, nunca una conclusión automática.

**Cómo quedó (9 sept 2026):** corre en el momento de cerrar un manifiesto
(`ManifestsService#close()`), nunca bloquea el cierre. Compara la
recaudación de ese manifiesto contra el promedio de los últimos 8
manifiestos cerrados de la MISMA unidad en la MISMA ruta — exige un mínimo
de 3 manifiestos previos antes de comparar nada (una unidad nueva no tiene
"su propio historial" todavía). Si la recaudación es ≤40% de ese promedio
(umbral propuesto por Claude, ajustable), marca el manifiesto
`CON_INCIDENCIA` con una nota explicando la comparación, y registra un
`AuditEntry` (`actorRole: 'SISTEMA'`) — el administrador revisa y decide
(vía `ManifestsService#correct()`, ya existente), el sistema nunca sanciona
ni concluye nada por su cuenta.

**Actualizado el 10 de septiembre de 2026 —** `CONSTRUIDO E IMPLEMENTADO`
de punta a punta: esto es visible en el resumen diario del gerente
(`OperationsCenter.tsx`, Inicio), en el registro de auditoría, y también en
la pantalla "Ventas y manifiestos" del panel de administrador
(`ManifestsPage.tsx`), que ya corre sobre el backend real
(`fetchManifests`/`correctManifest`/`closeManifest` de `operacion-api.ts`),
no sobre `src/data/demo.ts` — un manifiesto marcado `CON_INCIDENCIA` por
esta anomalía sí se ve reflejado ahí. El 9 de septiembre esta pantalla
todavía corría sobre datos de demostración; quedó resuelto como hallazgo
aparte, no como parte de este cambio.

**Implementado en:** `backend/src/manifests/manifests.service.ts#flagRevenueAnomalyIfAny()`
+ `backend/src/digest/digest.service.ts` (nuevo campo `anomaliasRecaudacionHoy`)
+ `OperationsCenter.tsx` (resumen del día).

### 2.5 Asistente de onboarding para nuevas asociaciones — `CONSTRUIDO E IMPLEMENTADO`

Cuando el Super Admin da de alta una asociación nueva, Claude puede ayudar a
poblar terminales, rutas y plantillas de configuración a partir de lo que el
cliente ya puso en su Solicitud comercial — acelera el paso "Organización →
Administrador → Operación" del wizard "Nueva asociación".

**Cómo quedó (9 sept 2026):** en el detalle de una Solicitud comercial
(Operación o PRO), un botón "Usar para nueva asociación (IA)" pide la
sugerencia y abre el wizard ya con los campos llenos — nombre, RUC,
contacto/administrador, ciudad y cantidad de unidades se copian directo del
formulario (no hace falta IA para eso); Claude solo interpreta el campo de
texto libre "¿Qué rutas cubres?" para separar terminal de origen/destino y
detectar rutas adicionales mencionadas aparte. Si no puede identificar un
corredor con confianza, deja esos campos vacíos en vez de inventar un
nombre de terminal — nunca decide, solo pre-llena (ia-aplicada.md §1): el
wizard sigue mostrando cada campo editable y no crea la asociación hasta
que el Super Admin confirma el último paso, exactamente igual que si lo
hubiera llenado a mano.

**Implementado en:**
`backend/src/commercial-requests/commercial-requests.service.ts#onboardingSuggestion()`
+ endpoint `GET /commercial-requests/:id/onboarding-suggestion` + botón y
prellenado en `SuperAdminApp.tsx` (`SACommercialRequests` → `NewOrgWizard`
con prop `fromRequest`).

### 2.6 Advertencia: dónde NO meter inferencia de IA

Ante pérdida de señal GPS, el sistema ya tiene definido el comportamiento
honesto: mostrar "Sin señal", mostrar la última posición válida con su
fecha/hora, nunca mover el marcador artificialmente ni afirmar que el
vehículo sigue ahí (`plan-gps-vehicular.md` §6.4). **No se debe usar IA para
"adivinar" una posición durante la pérdida de señal** — rompería
directamente ese principio de honestidad ya aprobado. Se documenta aquí como
advertencia explícita, no como propuesta.

## 3. El diferencial estratégico (lo que sí es un foso)

Las funciones de la sección 2 son valiosas pero replicables por cualquier
competidor con presupuesto — no dependen de nada que solo CHASKI AI tenga.
Las siguientes cuatro sí dependen de la combinación única de CHASKI AI:
datos operativos de cola/manifiesto/viaje cruzados con hardware GPS, y (en
los casos que lo requieren) escala de varias asociaciones a la vez.

**Prioridad acordada con Jayde (8 de septiembre de 2026): se construye
primero la detección de accidentes (§3.1)** — no depende de tener muchas
asociaciones, usa hardware que ya está en el roadmap de PRO, y tiene el
pitch de seguridad más directo. Las otras tres quedan documentadas como
visión de producto, sin fecha de inicio todavía.

### 3.1 Detección automática de accidentes en tiempo real — `CONSTRUIDO E IMPLEMENTADO` (versión heurística)

El hardware Teltonika de PRO ya envía telemetría continua (velocidad,
ignición, posición). Un patrón de desaceleración brusca + impacto +
inmovilidad total posterior es distinguible de un frenazo normal. Si el
sistema detecta esa firma, dispara automáticamente una alerta al
administrador de la asociación (y, a futuro, a un contacto de emergencia)
sin que nadie tenga que reportarlo primero. Relevante en particular para
corredores con tramos de altura y zonas sin señal como Juli–Puno.

**Aclaración honesta (9 sept 2026):** esto quedó construido como un patrón
de **velocidad + inmovilidad sostenida**, no como una detección real de
impacto — `gps.service.ts` (via Traccar) no lee ningún atributo de
acelerómetro/choque hoy, solo velocidad/posición/rumbo. Si el conductor
sube video/fotos de un choque real en el futuro, o Traccar empieza a
reportar un evento de impacto, esto se puede reforzar; por ahora la firma
que se detecta es "iba a velocidad normal y quedó inmóvil varios minutos
seguidos", que puede ser un accidente, una avería, o una parada real —
por eso la alerta siempre pide verificación humana, nunca se presenta
como confirmada.

Las 3 decisiones pendientes se resolvieron así (Jayde, 9 sept 2026):
umbral propuesto por Claude y ajustable (ver constantes en
`accident-detection.service.ts`: ≥30 km/h antes, ≤3 km/h después, 8 min de
inmovilidad sostenida, ventana de 20 min); notificación por **ambos**
canales — alerta en la app (reusa `CON_INCIDENCIA`/`incidentNote`, ya
visible en Viajes/Operaciones) y correo a cada Administrador activo.

**Implementado en:** `backend/src/safety/accident-detection.service.ts`
(`AccidentDetectionService`, cron cada 5 min con `@nestjs/schedule`) +
`backend/src/gps/gps.service.ts#getPositionHistory()` (historial de
posiciones vía Traccar) + `backend/src/mail/mail.service.ts#sendPossibleAccidentAlert()`.
Solo evalúa viajes `ACTIVO` de unidades con GPS físico vinculado (Plan PRO
real) — sin hardware no hay telemetría continua que analizar. Al disparar,
reusa el mecanismo ya existente de incidencia (`Trip.status = CON_INCIDENCIA`
+ `incidentNote`, `AuditEntry` con `actorRole: 'SISTEMA'`) — nunca crea un
estado nuevo ni resuelve nada solo: sigue siendo el administrador quien
revisa y resuelve (`resolveIncident`), igual que cualquier otra incidencia.
Requiere que el servidor corra `npm install` en `backend/` una vez (nueva
dependencia `@nestjs/schedule`).

### 3.2 Mapa de riesgo de ruta construido con la flota — `CONSTRUIDO E IMPLEMENTADO` (versión básica, una sola asociación)

Agregar frenadas bruscas, caídas de velocidad y paradas anómalas de todos
los vehículos de todas las asociaciones en un mismo corredor, a lo largo del
tiempo, para producir un mapa de puntos de riesgo real (curvas, huecos,
zonas de neblina o derrumbe) sin que nadie lo reporte manualmente. Requiere
volumen de datos de varias asociaciones para ser útil — no tiene sentido con
una sola flota chica.

**Aclaración honesta (9 sept 2026):** Jayde confirmó construir la versión
básica igual, aun sabiendo que con una sola flota chica los puntos todavía
dicen poco — se vuelve más útil con más unidades y más historial acumulado.
Lo construido es de **una sola asociación a la vez** (no agrega entre
asociaciones — eso queda para cuando haya varias con volumen real) y calcula
los puntos **al vuelo** cuando el administrador abre la pantalla, leyendo el
historial que Traccar todavía conserve — no hay tabla ni cron propio
guardando eventos, así que la ventana disponible depende de cuánto
historial retenga el servidor Traccar (fuera del control de este backend).
Mismos 2 tipos de evento que la detección de accidentes (velocidad +
posición, no un sensor de choque real): frenada brusca (caída fuerte de
velocidad en poco tiempo) y parada anómala (inmóvil varios minutos, lejos de
ambos terminales).

**Implementado en:** `backend/src/route-risk/route-risk.service.ts`
(`RouteRiskService#getRiskPoints()`, agrupa eventos por celda de mapa) +
endpoint `GET /route-risk` (mismo guard de Plan PRO que `/gps/live`) +
pantalla "Mapa de riesgo" en el panel de administrador (`RouteRiskPage.tsx`,
`RouteRiskMap.tsx` con círculos de severidad sobre Google Maps), dentro del
grupo GPS PRO del menú.

### 3.3 Pronóstico de demanda con contexto real

No es solo "cuántos carros salieron el martes pasado": cruzar el histórico
operativo con contexto externo (ferias, fechas de pago, feriados regionales,
clima en la ruta) para avisar con anticipación, por ejemplo "el viernes va a
haber más demanda de lo normal en Puno" — antes de que se forme la cola.
Convierte la reubicación de reactiva (cuando ya hay unidades varadas) a
preventiva. Requiere historial operativo suficiente y una fuente de datos
externa confiable; sin fecha de inicio todavía.

### 3.4 Paquete automático de evidencia legal/seguros ante un incidente

Ante un accidente o robo, armar automáticamente el expediente (manifiesto,
posición GPS, hora de salida, pasajeros a bordo) en vez de que alguien lo
junte manualmente, listo para entregar a una aseguradora o a la policía.
Depende de tener el flujo de manifiesto y GPS ya sólidos en producción;
`PENDIENTE DE DECISIÓN`.

## 4. Relación con las propuestas de Plan PRO

Las cuatro propuestas de mejora para Plan PRO (mantenimiento predictivo,
puntaje de conducción, sugerencia de reubicación, reportes de eficiencia)
viven documentadas en `plan-pro.md` §11, no se repiten aquí — todas comparten
el mismo principio rector de la sección 1 de este documento.

## 5. Estado real (verificado contra el código el 9 de septiembre de 2026)

**Construido e implementado:** §2.1 (triaje de solicitudes comerciales),
§2.2 (digitalización de manifiestos con visión), §2.3 (resumen diario
automático) — las tres con su servicio de backend real, su pantalla
conectada, y usando el wrapper común `AnthropicService` (`ai/anthropic.service.ts`)
— §2.4 (anomalías en recaudación, marca `CON_INCIDENCIA` al cerrar un
manifiesto, visible también en `ManifestsPage.tsx` desde el 10 de
septiembre), §2.5 (asistente de onboarding, sugerencia para pre-llenar el
wizard "Nueva asociación" desde una Solicitud comercial), §3.1 (detección
automática de posibles accidentes, versión heurística de velocidad +
inmovilidad, ver detalle en su sección — cron real con `@nestjs/schedule`,
notifica por app y correo) y §3.2 (mapa de riesgo de ruta, versión básica
de una sola asociación, calculado al vuelo sobre el historial GPS real).

**Actualizado el 10 de septiembre de 2026 — también construido e
implementado:** el asistente conversacional (`plan-pro.md` §6/§8) ya no es
"a medias" — además del backend completo (`assistant/assistant.service.ts`,
con tool calling real contra la base de datos, nunca inventa una cifra) y
su función de API en el frontend (`sendAssistantMessage()`), ahora sí tiene
pantalla: `AssistantPage.tsx` (chat de página completa, con sugerencias de
pregunta) y `AssistantWidget.tsx` (widget flotante), ambos wireados en
`AdminApp.tsx` y visibles cuando la asociación tiene Plan PRO. El 9 de
septiembre esto seguía pendiente de interfaz.

**Pendiente de decisión, nada construido:** §3.3 (pronóstico de demanda) y
§3.4 (paquete de evidencia legal/seguros), además de las 4 propuestas de
`plan-pro.md` §11 (mantenimiento predictivo, puntaje de conducción,
sugerencia de reubicación, reportes de eficiencia).
