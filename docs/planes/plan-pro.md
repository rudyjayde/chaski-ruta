# Plan PRO

Fuente: Documento Maestro §7.2, §7.2.1 (agregada en esta conversación), §7.4. PRO se activa para **toda la asociación**, no por unidad — para eso existe el complemento GPS Vehicular (ver `plan-gps-vehicular.md`).

## 1. Qué es

PRO = todo Plan Operación, **más** una capa de hardware y visibilidad continua para toda la flota de la asociación. No reemplaza nada del flujo de Operación: la cola, el manifiesto, las reglas de secuencia y reubicaciones funcionan exactamente igual.

Se activa después de solicitud, cotización, pago verificado y configuración del Super Admin. El administrador puede "Solicitar PRO", pero solo el Super Admin de CHASKI AI verifica el pago, asigna dispositivos y activa el alcance.

## 2. Qué agrega sobre Operación (§7.2)

**Estado real (actualizado 12 de septiembre de 2026):** GPS físico vía Traccar
(`backend/src/gps/gps.service.ts`, conexión real por API REST con
`TRACCAR_API_URL/EMAIL/PASSWORD`, verificado en vivo contra ATIPCAR-001),
mapa de flota en vivo (`LiveFleetMap.tsx` / `GPSLivePage.tsx`), última
posición, señal, energía, ignición y kilometraje reales, historial de
recorridos (`GPSHistoryPage.tsx`), y 7 tipos de alerta automática
(`backend/src/gps-alerts`, `backend/src/safety`) — todas evidencia para
revisión humana, ninguna sanciona sola:

  - `DESCONEXION` — dispositivo dejó de reportar.
  - `MOVIMIENTO_SIN_VIAJE` — se mueve sin viaje activo registrado.
  - `CORTE_ENERGIA` — voltaje de la batería del vehículo cae (equipo pasó a batería interna).
  - `POSIBLE_REMOLQUE` — se desplaza con el motor apagado.
  - `BOTON_PANICO` — por hardware (equipo con botón físico cableado, sin
    verificar todavía contra un evento real) o por reporte manual del
    conductor ("Reportar emergencia" en su panel, ya probado en vivo).
  - `FALLA_REPORTADA` — "Reportar falla GPS" del conductor, ya probado en vivo.
  - `POSIBLE_ACCIDENTE` — patrón de velocidad+inmovilidad sostenida
    (`accident-detection.service.ts`), NO lectura de un sensor de impacto real.

- GPS físico para las unidades incluidas en el contrato (hardware Teltonika).
- Mapa de flota en vivo.
- Última posición válida, estado de señal, energía e ignición reales.
- Historial de recorridos, paradas y kilometraje real (Traccar `totalDistance`).
- **Geocerca del corredor autorizado: construida (12 sept 2026)**
  (`backend/src/route-geofence`, `RouteGeofencePage.tsx` en Admin → GPS →
  "Corredor autorizado"). El administrador dibuja el polígono A MANO sobre
  el mapa real, punto por punto — NUNCA se genera automáticamente a partir
  de una línea recta entre los dos terminales (la carretera de montaña
  Juli-Puno tiene curvas reales; una franja recta daría falsos positivos).
  Con el corredor guardado, si una unidad con viaje ACTIVO cae fuera del
  polígono, se genera la alerta `FUERA_DE_RUTA` (mismo sistema que el resto:
  banner, campanita, badges). El radio de terminal para inscripción/llegada
  (§3) sigue siendo un cálculo de distancia puntual aparte, sin cambios. El
  propio equipo Teltonika tiene pestañas "Auto/Manual Geofence" y Traccar
  tiene geocercas nativas — no se usó ninguna de las dos; se optó por un
  polígono propio en la base de datos de CHASKI AI, más simple de integrar
  con el resto del sistema de alertas ya existente.
- Estado técnico de dispositivos: conexión por dispositivo
  (online/offline/unknown, `getDeviceStatuses()`) — sigue sin dato específico
  de SIM (saldo, vencimiento).
- Reportes avanzados de flota y recorridos — ver §11.
- Herramientas de supervisión para el gerente — banner de alertas en Inicio/
  Resumen (Admin/Socio/Conductor), badges reales en la barra lateral,
  campanita real con avisos privados.
- Soporte GPS y mantenimiento según contrato — ver §11.1.

### Bloqueo remoto de motor y detección de jamming (12 sept 2026)

**Bloqueo remoto de motor: construido y probado en vivo de punta a punta**
(`backend/src/engine-lock`). Flujo de doble confirmación decidido con Jayde:
el Socio SOLICITA el bloqueo de su propia unidad (motivo obligatorio), y
**solo Super Admin** confirma, cancela o restaura — nunca el Administrador de
la asociación. Si la unidad ya está detenida al confirmar, se ejecuta al
toque; si está en movimiento, un cron cada 30s espera una detención
SOSTENIDA (no un instante) antes de enviar el comando real `engineStop` /
`engineResume` de Traccar. Probado en vivo contra ATIPCAR-001: Traccar aceptó
ambos comandos. **Pendiente:** ningún vehículo tiene todavía el relé de
combustible/ignición cableado a una salida digital — hasta entonces no hay
efecto físico real sobre ningún motor.

**Bloqueo directo por Super Admin, sin solicitud digital previa (agregado 12
de septiembre de 2026):** excepción decidida con Jayde para cuando el socio
llama por teléfono en vez de solicitarlo desde su panel — Super Admin puede
crear y ejecutar el bloqueo directamente (`POST
/engine-lock/vehicles/:vehicleId/direct`, botón "Bloquear ahora (llamada del
socio)" en Super Admin → GPS y en Asociaciones → editar → Bloqueo de motor).
El motivo sigue siendo obligatorio siempre, sin excepción. La solicitud queda
registrada a nombre del socio dueño real de la unidad (para que las
notificaciones le lleguen a él), pero la auditoría marca el `actorId` como el
propio Super Admin en ambos pasos (creación y confirmación) — esa diferencia
por sí sola distingue este camino telefónico del flujo digital normal.

**Detección de jamming: descartada, no pendiente.** Se revisó la pestaña
"Security" del Teltonika Configurator (FMC130, firmware 04.00.00) — solo
tiene PIN de SIM, palabra clave para comandos SMS y certificados TLS. Este
equipo no expone ninguna función de detección de bloqueo de señal.

**Principio importante:** PRO no genera sanciones automáticas basadas únicamente en GPS. Una alerta es evidencia para revisión, no una condena automática — mismo criterio que ya se usa en Operación (nunca castigar solo con una señal débil).

## 3. La cola en unidades PRO: el hardware reemplaza al celular, nunca a la decisión del conductor (§7.2.1)

Las verificaciones de llegada de Operación (vínculo cuenta-dispositivo, chequeo puntual de GPS del celular, tiempo mínimo de viaje, cadena de predecesores) son un sustituto de una fuente de verdad física que Operación no tiene. Una unidad con GPS físico activo bajo PRO ya no necesita ese sustituto: el servidor conoce la posición real del vehículo en todo momento.

**Corrección (4 de septiembre de 2026):** se descarta la inscripción 100% automática por geocerca. El hardware **reemplaza al GPS del celular como fuente de verdad de ubicación**, pero el conductor sigue siendo quien decide presionar "Inscribirme" o "No saldré ahora" — igual que en Operación (`plan-flujo-colas-hardware.md` §1 y §2). Entrar a la geocerca de la terminal no inscribe solo al vehículo.

Para unidades con GPS físico activo:

- Al presionar "Inscribirme", la condición de GPS de terminal (`plan-operacion.md` §3.3) se valida con la posición real del vehículo leída de Traccar, en vez de con el celular — el resto del flujo (los 60 minutos, la cadena de predecesores) es idéntico a Operación.
- Como el dispositivo se vincula por IMEI al **vehículo**, nunca a una cuenta o conductor, esa validación deja de depender de qué cuenta esté activa. Esto cierra estructuralmente el vector de fraude por cuentas o dispositivos compartidos: ninguna cuenta puede sustituir la presencia física real del vehículo.
- La regla dura de secuencia (no puede entrar a la cola contraria con viaje activo) sigue exactamente igual — se verifica con datos de posición reales en vez de con un proxy de tiempo mínimo.
- Riesgos residuales, ya no de cuentas sino de hardware: pérdida de señal, y en teoría el traslado físico del dispositivo entre vehículos (mitigado con el registro de IMEI/fotos/responsable en la instalación y detección de patrones de telemetría anómalos).
- Las herramientas manuales de excepción (botón de alerta, intervención del gerente) siguen igual que en Operación para incidentes reales — el GPS físico no las reemplaza.

### Resuelto en la implementación (11 de septiembre de 2026)

- **Pérdida de señal al inscribirse:** ya no está pendiente. `queues.service.ts` intenta `gps.getVehiclePosition()` (Traccar); si no hay fix disponible, cae directo al chequeo por GPS del celular (mismo mecanismo de Operación) en vez de bloquear o marcar "Sin señal". Sin ninguna de las dos evidencias, solo administrador/superadmin puede continuar (caso de excepción, igual que en Operación).

## 4. Qué cambia realmente vs. Operación (resumen)

| Capacidad | Operación | PRO |
|---|---|---|
| Cola digital y manifiestos | Sí | Sí — sin cambios |
| Viajes y reportes operativos | Sí | Sí — sin cambios |
| Reglas de secuencia / cadena de predecesores / reubicaciones | Sí | Sí — sin cambios |
| GPS físico | No | Flota contratada |
| Mapa en vivo | No | Gerente, con permisos definidos |
| Historial GPS / kilometraje | No | Flota contratada |
| Geocercas y alertas | No | Toda la asociación |

Nada del flujo operativo diario cambia. Lo único que cambia es **cómo se prueba** que un vehículo llegó — de un proxy indirecto (celular, cuenta, tiempo mínimo) a una fuente de verdad física (GPS del vehículo).

## 5. Qué empuja la migración a PRO (opinión de producto, no está en el documento maestro)

Operación resuelve el dolor urgente (el caos de colas). PRO no resuelve un dolor urgente nuevo — profesionaliza y da visibilidad remota continua. Lo que en la práctica empuja a una asociación a pagar PRO:

- Escala: muchas unidades, el gerente ya no puede llamar para saber dónde está cada carro.
- Responsabilidad legal / seguros: necesitan evidencia real de ubicación y velocidad ante un accidente o reclamo.
- Control de kilometraje/combustible/mantenimiento.
- Un dueño que quiere supervisar remotamente sin estar en terminal.

## 6. Asistente conversacional (panel admin)

**Construido** (`backend/src/assistant`, `AssistantPage.tsx`/`AssistantWidget.tsx`) — usa el SDK real de Anthropic con tool-calling (nunca inventa cifras).

- **Nombre:** dinámico por asociación, con el patrón `{Nombre de la asociación} AI` (ej. "ATIPCAR AI"), calculado automáticamente a partir de `Organization.name` — nunca programado a mano por cliente, para que funcione igual con cualquier asociación nueva sin trabajo extra.
- **Motor:** API de Claude. Responde en lenguaje natural, no robótico — saluda por nombre primero (ej. "Hola Carlos, el vehículo 001, el conductor Rubén, hizo 4 vueltas hoy").
- **Diseño técnico obligatorio:** Claude solo debe "llamar" a consultas reales del sistema (function/tool calling contra datos reales) — nunca debe generar una cifra libremente. Así nunca alucina un dato operativo.
- **Ejemplos de uso (panel admin, alcance amplio — a diferencia del bot de WhatsApp, ver §8):** "¿dónde está el vehículo 001?", "¿cuántas vueltas hizo tal conductor?".
- **Definiciones de negocio para las consultas:** *vuelta* = ida y vuelta completa (Juli→Puno + Puno→Juli); *media vuelta* = un solo tramo.

## 7. Recaudación por Empresa

**Construido** (11 de septiembre de 2026) — `ReportsPage.tsx`, tipo de reporte "Recaudación por empresa" (visible solo si `isPRO`), agregado sobre los manifiestos reales ya cargados (agrupa por `Manifest.company`, sin backend nuevo — el dato ya viaja en cada manifiesto).

- **Operación:** recaudación visible solo por código/vehículo individual — cada unidad ve lo suyo, sale directo de sus propios manifiestos.
- **PRO:** recaudación consolidada, agrupada **por empresa miembro** de la asociación (ej. Litoral, Virgen de Fátima, San Francisco de Borja) — vista gerencial de más alto nivel, no solo un vehículo a la vez.

## 8. Asistente por WhatsApp Business (conductores y socio-conductores, mientras conducen)

**Estado: NO construido, dejado deliberadamente para el final** (Jayde, 11 de
septiembre de 2026) — de todo lo pendiente de PRO, es lo único que se
posterga a propósito. Requiere una integración externa nueva (WhatsApp
Business Platform vía Meta/Twilio/360dialog/Gupshup) con costo por
conversación y verificación de negocio ante Meta — no es solo código sobre
datos que ya existen, como sí lo fueron §6, §7 y §9.

**Decidido (Jayde, 11 de septiembre de 2026):** este canal es solo para
**conductores** — incluido el socio que también maneja, pero en su rol de
conductor mientras está al volante. El socio "puro" (dueño que no maneja) no
lo necesita: su panel web (`PartnerApp.tsx`) ya muestra en un dashboard todo
lo que preguntaría por WhatsApp — estado en cola, recaudación del día,
viajes, manifiestos, producción y GPS de su unidad — sin costo por
conversación. WhatsApp tiene sentido para el conductor porque está en ruta o
en terminal, sin acceso cómodo a una pantalla; el socio revisa su panel
cuando quiere, sentado, así que no vale la pena duplicar ese motor de
consulta por un canal que cobra por conversación.

Mismo asistente/cerebro que el del panel admin (§6), pero como canal aparte, con alcance mucho más acotado:

- **Requiere WhatsApp Business Platform** (Meta Cloud API, normalmente vía un proveedor como Twilio, 360dialog o Gupshup) — no es la app normal de WhatsApp Business, cobra por conversación y exige verificación de negocio ante Meta.
- **Seguridad — vínculo número↔perfil:** solo responde con datos reales si el número de WhatsApp que escribe coincide con el `phone` ya vinculado a esa persona en el sistema. Si el número no está reconocido, no entrega ningún dato — pide vincularlo con el administrador.
- **Alcance limitado a dos niveles:**
  1. **Cola general de la asociación** (Juli→Puno / Puno→Juli) — información compartida, la misma que ya se ve en pantalla de terminal, no sensible, disponible para cualquier cuenta verificada.
  2. **Datos personales del que pregunta:** mi turno, cuántos carros me faltan (relativo a mi propio código), mis vueltas — incluyendo por rango de fechas, desglosadas por método de pago (efectivo/Yape/Plin) y su suma total.
- **Fuera de ese alcance, el asistente redirige** en vez de responder: algo como "Solo puedo ayudarte con tu cola, tu turno o tu perfil (vueltas, recaudación, GPS de tu unidad)." Nunca contesta temas ajenos — protege el costo por conversación y evita que "alucine" fuera de lo que puede verificar.
- **Es un canal exclusivo de consulta (pull)** — el asistente nunca inicia una conversación por su cuenta. Los avisos del admin van por otro canal (§9), no por WhatsApp.
- **Activable/desactivable por asociación desde Super Admin**, mismo patrón que el mini-mapa del conductor, por control de costo de WhatsApp Business Platform.

**Decidido (Jayde, 11 de septiembre de 2026):** este canal de WhatsApp Business aplica **solo a asociaciones con Plan PRO** — no existe una versión básica para Operación. Coherente con que el costo por conversación de WhatsApp Business Platform ya se activa/desactiva por asociación desde Super Admin (punto anterior), igual que el resto de funciones PRO de esta sección.

**Decidido (Jayde, 11 de septiembre de 2026):** se evaluó agregar "mi velocidad actual" al alcance de datos personales (punto 2 de arriba) — dato que sí existe en tiempo real vía Traccar — y se descartó. El alcance de datos personales queda solo en turno/cola y vueltas/recaudación.

## 9. Avisos (panel admin → notificaciones)

**Construido** (11 de septiembre de 2026) — modelo `Notice` (`backend/src/notices`), disponible para Operación y PRO por igual (sin costo de por medio, a diferencia de §8). `NoticesPage.tsx` (admin, redactar + historial), `DriverNotices`/`PartnerNotices` (solo lectura, filtrado por audiencia en el backend según el rol de quien pregunta).

- El administrador redacta un aviso desde su panel y lo dirige a un público: conductores, socios, o ambos (posible extensión: filtrar también por empresa miembro o por ruta).
- Se entrega como **notificación dentro de la app/plataforma web** de cada perfil — **no por WhatsApp**. Motivo: WhatsApp Business Platform no permite mensajes de texto libre iniciados por el negocio fuera de plantillas pre-aprobadas por Meta (y esas plantillas, si califican como "marketing", cuestan más y tienen más restricciones) — evitar toda esa fricción manteniendo avisos 100% dentro de la app.

## 10. Brechas conocidas entre el diseño y el código actual (auditoría actualizada 12 de septiembre de 2026)

- **Eliminadas (12 sept 2026, decidido con Jayde):** "Solicitudes GPS" (`SAGPSRequests`), "Instalaciones GPS" (`SAInstallations`), "Suscripciones GPS" (`SAGPSSubscriptions`) y "Config. de cobros" (`SABillingConfig`) se quitaron del menú de Super Admin — eran 100% datos de ejemplo hardcodeados (`GPS_REQUEST_SEED` y similares), nunca leían ni escribían nada real, y no representaban ningún flujo comercial que fuera a construirse pronto. La migración "GPS Vehicular → PRO sin doble cobro" (§7.3) quedó sin ninguna pantalla — no hay cálculo de prorrateo, fecha de corte ni registro de ajuste real. Lo único real hoy es vincular el IMEI directamente desde Asociaciones → editar → GPS o desde Super Admin → GPS (ver `plan-gps-vehicular.md` §6.1/6.2 y §13 de este documento).
- **"Salud técnica" (`SATechHealth`, menú Super Admin) es 100% datos de ejemplo** (latencias, uptime y estado de servicios hardcodeados) — no consulta ningún servicio real. No confundir con Super Admin → GPS, que sí es real (§13). Pendiente decidir si se construye de verdad (necesitaría monitoreo real de los propios servicios de CHASKI AI: API, base de datos, notificaciones) o si se elimina igual que las pantallas de arriba.
- **Decisión final (12 sept 2026, decidido con Jayde) sobre visibilidad del Administrador sin PRO:** se evaluó corregir el diseño original (`plan-gps-vehicular.md` §4, que sugería mostrarle al gerente al menos que existe "GPS particular"), pero se decidió **al revés** — el Administrador de una asociación sin PRO no ve absolutamente nada de GPS Vehicular individual, ni el menú, ni las alertas. Es privado del socio que lo paga; el rol de "controlador" cuando no hay PRO lo cumple Super Admin (correo + Resumen), nunca el Administrador. `plan-gps-vehicular.md` §4 quedó desactualizado por esta decisión.
- Precios de referencia de PRO: no hay ninguna pantalla que los muestre o edite (se eliminó `SABillingConfig`) — siguen pendientes de definir, sin ningún lugar hardcodeado que corregir.
- El asistente por WhatsApp Business (§8) sigue sin construir — es la única brecha dejada a propósito para el final (ver §8).
- Corte remoto de motor (ver §2): el software está completo y probado en vivo; falta el cableado físico del relé en cada vehículo (instalación, no código).
- Botón de pánico por hardware (ver §2): la detección ya está lista pero sin verificar contra un evento real, porque ningún equipo tiene el botón físico cableado todavía. El reporte manual del conductor sí funciona hoy.

## 11. Propuestas de mejora para PRO (8 de septiembre de 2026)

Aprovechan que PRO ya tiene hardware GPS instalado y telemetría continua.
Mismo principio que el resto de la plataforma: la IA sugiere o alerta, el
administrador decide — ver `ia-aplicada.md` §1.

**Estado real (construido, 12 de septiembre de 2026):** las 4 viven en
`backend/src/fleet-reports` (11.1 además en `vehicles.service.ts`) y en el
panel Admin → Reportes → "Mantenimiento predictivo" / "Sugerencia de
reubicación" / "Eficiencia por ruta/empresa" / "Eventos de conducción
(evidencia)". Ninguna ejecuta nada automáticamente — todas son evidencia o
sugerencia para que el gerente decida, igual que las alertas GPS (§2).

### 11.1 Mantenimiento predictivo por telemetría

**Construido**, pero simplificado frente a la idea original: el sistema NO
infiere solo un patrón de frenado o calcula horas de motor por su cuenta.
`Vehicle.lastServiceKm` / `serviceIntervalKm` los define el administrador
(nunca un número inventado por el sistema) y se comparan contra el
kilometraje real que ya reporta Traccar (`totalDistance`, ver §2) para
avisar cuando toca servicio.

### 11.2 Puntaje de conducción como evidencia, no como sanción

**Parcial a propósito:** se construyó SOLO el conteo real de frenadas
bruscas por conductor (mismo criterio que `route-risk.service.ts`, atribuido
al conductor vía el viaje activo que cubre ese instante). Deliberadamente
**no** se calculó ningún puntaje ni ranking todavía — unas semanas de datos
no alcanzan para saber qué es un patrón normal en este corredor sin inventar
el criterio. El puntaje en sí queda pendiente hasta que haya suficiente
historial real acumulado.

### 11.3 Sugerencia de reubicación, no ejecución automática

**Construido.** Compara la cola actual de cada terminal contra el promedio
histórico real de esa hora del día (últimos 30 días, `QueueEntry.registeredAt`)
y solo sugiere un número de unidades (mitad de la diferencia, redondeada
hacia abajo — cálculo simple y transparente, no un algoritmo oculto) cuando
hay un desbalance claro. El administrador sigue eligiendo manualmente qué
unidades mover — eso no cambia (`DOCUMENTO_MAESTRO_NEGOCIO_Y_PRODUCTO.md` §6.6).

### 11.4 Reportes de eficiencia por ruta y horario

**Construido.** Tiempos de vuelta reales (viajes completados con salida y
llegada registradas) agrupados por empresa, comparados contra el promedio
del corredor — información gerencial ya existente en la data operativa, sin
inventar ningún umbral de "bueno/malo".

## 12. Detección automática de posibles accidentes

**Construido** (`backend/src/safety/accident-detection.service.ts`, unido al
sistema de Alertas GPS el 12 de septiembre de 2026). Cron cada 5 minutos
sobre viajes ACTIVOS con GPS real: si una unidad iba a ≥30 km/h y queda
inmóvil (≤3 km/h) 8+ minutos seguidos, marca el viaje como `CON_INCIDENCIA`,
manda correo a los administradores activos, y ahora también crea una
`GpsAlert` tipo `POSIBLE_ACCIDENTE` (visible en el banner rojo, la campanita
y "Alertas GPS", igual que el resto). Es un patrón de velocidad+inmovilidad,
**no** una lectura real de un sensor de impacto — el texto de la alerta
siempre dice "no confirmado" y pide verificación humana.

## 13. Panel GPS y CRM de pasajeros consolidados en Super Admin (12 de septiembre de 2026)

**Importante: nada de esta sección depende del plan** — a diferencia de todo
lo anterior en este documento, lo siguiente es herramienta exclusiva de
Super Admin (multi-asociación), no una función que una asociación "compra"
con PRO. Se documenta aquí porque nació de la misma conversación de GPS/plan,
no porque sea parte de la oferta comercial de PRO.

**Construido:**

- **Super Admin → GPS** (`GPSOverviewPage.tsx`): lista de las asociaciones
  reales con salud GPS a simple vista (unidades vinculadas/total, en línea,
  alertas abiertas, bloqueos de motor pendientes — todo calculado en vivo,
  nada inventado). Al entrar a una asociación: tabla completa de unidades
  (IMEI, SIM informativo, estado de señal, bloqueo de motor) y una pestaña de
  **mapa en vivo** (mismo `LiveFleetMap.tsx` que usa el panel de
  administrador, filtrado por esa asociación) — funciona sin importar si esa
  asociación está en PRO u Operación, porque el acceso a la posición de una
  unidad siempre dependió del dispositivo vinculado, no del plan (ver
  `plan-gps-vehicular.md` §4).
- **Super Admin → Pasajeros** (`PassengerProfilesPage.tsx`): perfil agregado
  por DNI dentro de cada asociación (`PassengerProfile`), alimentado
  automáticamente cada vez que un conductor agrega un pasajero a un
  manifiesto — de nuevo, funciona igual en Operación y en PRO, porque
  manifiestos y pasajeros no son una función exclusiva de PRO. Incluye:
  - Correo del pasajero (dato NO obligatorio): si el conductor lo llena, se
    guarda y se le manda un correo tipo boleto de ESE viaje (`MailService.
    sendPassengerTicketEmail`, mismo patrón best-effort que el resto de
    correos). El correo queda guardado en el perfil aunque un viaje futuro no
    lo repita.
  - Pestaña "Dashboard": ranking de pasajeros con más viajes y que más
    ingresos generaron, método de pago preferido, dirección de viaje
    preferida, nuevos vs. recurrentes por mes, y días promedio reales entre
    viajes — todo calculado de filas reales de `Passenger`+`Manifest`, sin
    ningún puntaje o umbral inventado (mismo criterio que §11.2).

Ver `ia-aplicada.md` para las funciones de IA transversales al negocio (no exclusivas de PRO).
