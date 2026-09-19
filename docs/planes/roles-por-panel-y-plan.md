# Qué puede hacer cada rol, panel por panel y plan por plan

Documento de referencia rápida — complementa a `plan-operacion.md` y
`plan-pro.md` (organizados por plan) mirando lo mismo desde el otro lado:
por **rol**. Todo lo que dice "Construido" está verificado directo contra el
código de este commit (navegación real de `AdminApp.tsx`, `PartnerApp.tsx`,
`DriverApp.tsx`), no es una lista aspiracional.

No cubre Super Admin (CHASKI AI) — ese es el operador de la plataforma, no
un rol dentro de una asociación cliente; su alcance vive en `plan-pro.md`
§13 y en `DOCUMENTO_MAESTRO_NEGOCIO_Y_PRODUCTO.md`.

## 1. Los 3 roles de una asociación cliente

| Rol | Quién es | Panel |
|---|---|---|
| **Administrador** | Gerencia de la asociación (ATIPCAR, por ejemplo) | `AdminApp.tsx` — escritorio |
| **Socio** | Dueño de una o más unidades (puede o no manejar) | `PartnerApp.tsx` — escritorio |
| **Conductor** | Maneja una unidad (puede o no ser también su dueño) | `DriverApp.tsx` — pensado para celular |

Una misma persona puede tener **hasta 2 cuentas** con el mismo correo — una
Socio, una Conductor (ej. el dueño que también maneja) — nunca dos con el
mismo rol. Si el correo tiene más de una cuenta activa, el login pregunta
"¿a cuál panel quieres entrar?" antes de dar la sesión.

Ningún rol se puede eliminar de verdad — solo se suspende ("dar de baja").
El historial de esa persona (viajes, manifiestos, auditoría) queda intacto
para siempre, tanto para reportes del Administrador como del Super Admin.

### Cómo entra cada persona, y "Mi cuenta"

- **Solo por invitación:** un correo que un administrador no registró antes no entra por ninguna vía.
- **Dos formas de entrar** (actualizado 19 sept 2026): con Google, o con su correo y una contraseña propia. El correo de bienvenida trae el botón **"Crear mi contraseña"** (enlace de un solo uso, vale 7 días); sirve con cualquier correo, no solo Gmail. Las cuentas anteriores a ese cambio usan "Recuperar acceso" una vez.
- **Mi cuenta** (menú de arriba a la derecha, en los cuatro paneles): la persona corrige su nombre, DNI y celular (y, si es conductor, su licencia con fecha de emisión y vencimiento). **El correo, el rol y la asociación no se pueden cambiar.** Cada cambio queda en Auditoría con el DNI enmascarado. Desde ahí también puede pedir el enlace para crear o cambiar su contraseña.
- **Celular y tablet:** los cuatro paneles se adaptan a pantallas pequeñas — el menú es un cajón que se abre con el botón de las tres rayas, y los paneles de detalle ocupan toda la pantalla. En escritorio no cambia nada.

## 2. Administrador

Panel de escritorio de la gerencia. Ve y controla **toda** la operación de
su asociación.

### Disponible siempre (Plan Operación, base de todo)

- **Inicio / Operación** — resumen del día en vivo, y la tarjeta **"Licencias de conducir por revisar"** (conductores con licencia vencida o por vencer, y cuántos no tienen ninguna registrada).
- **Colas** — colas digitales por dirección (Juli→Puno / Puno→Juli), estados
  LLAMANDO / RAMPA / EXTERIOR.
- **Ventas y manifiestos** — registro de pasajeros, mapa de asientos, medios
  de pago, cierre de manifiesto, PDF y QR público de verificación.
- **Viajes** — ciclo completo salida → tránsito → llegada.
- **Reubicaciones** — mover unidades vacías entre terminales cuando hay
  desbalance de demanda (decisión manual del administrador, con motivo).
- **Inscripción retrasada** — resolver el caso de un conductor bloqueado por
  un predecesor que no se anotó (llamar al predecesor o autorizar igual).
- **Unidades y flota** — alta de vehículos, cambio de conductor/socio
  asignado, mantenimiento. Por defecto solo se ven las unidades activas.
  - **Desactivar** (temporal, ej. taller): la unidad sigue registrada y se reactiva.
  - **Dar de baja** (ya no opera, se vendió o fue un error): desaparece de la flota y de todas las pantallas; el historial de viajes se conserva y se puede **restaurar**. Motivo obligatorio y queda en Auditoría. No se puede si tiene un viaje en curso o está en una cola. Se puede hacer de a una o **varias a la vez** ("Dar de baja unidades" → marcar → un solo motivo). Si se intenta registrar un código o placa de una unidad dada de baja, el sistema ofrece restaurarla.
- **Empresas integrantes** — solo ver (crear, suspender o eliminar una
  empresa es exclusivo de Super Admin). Las suspendidas quedan ocultas por
  defecto ("Mostrar suspendidas"); las eliminadas no aparecen.
- **Personas** — alta de socios y conductores (con reason obligatorio al dar
  de baja), reset de vinculación cuenta-dispositivo. **No puede** dar de alta
  a otro Administrador — eso es exclusivo de Super Admin (el administrador
  le pasa los datos por fuera y Super Admin lo registra). El conductor lleva
  su licencia con **fecha de emisión y vencimiento** y un estado (Vigente /
  Por vencer / Vencida) con columna y filtro "Requieren atención" — solo
  alerta, no bloquea. Dos personas no pueden tener el mismo DNI en la misma
  asociación. Ver `reglas-de-datos-y-validaciones.md`.
- **Avisos** — redactar y enviar avisos dentro de la plataforma (a
  conductores, socios o ambos). Disponible en Operación y PRO por igual.
- **Reportes** — producción por unidad/empresa/jornada, ausencias,
  incidencias, recaudación (solo por unidad individual en Operación).
- **Auditoría** — cada acción con actor, recurso, motivo y antes/después.
- **Soporte** — abrir tickets a CHASKI AI (Super Admin) y ver respuestas.
  Exclusivo del Administrador, ni Socio ni Conductor lo tienen.
- **Plan** — ver el plan actual de la asociación y solicitar PRO.

### Se agrega con Plan PRO

- **Asistente AI** (`{Asociación} AI`, ej. "ATIPCAR AI") — responde en
  lenguaje natural sobre datos reales ("¿dónde está el vehículo 001?",
  "¿cuántas vueltas hizo tal conductor?"). Nunca inventa cifras — solo
  consulta datos reales.
- **GPS en vivo** — mapa de flota en tiempo real (toda la asociación).
- **Historial GPS** — recorridos, paradas, kilometraje real.
- **Dispositivos GPS** — estado de conexión por unidad (online/offline).
- **Alertas GPS** — 7 tipos de alerta automática (desconexión, movimiento sin
  viaje, corte de energía, posible remolque, botón de pánico, falla
  reportada, posible accidente) — siempre evidencia para revisión humana,
  nunca una sanción automática.
- **Mapa de riesgo** / **Corredor autorizado** — geocerca real dibujada a
  mano sobre el corredor Juli-Puno; alerta `FUERA_DE_RUTA` si una unidad con
  viaje activo sale del polígono.
- **Reportes avanzados** — mantenimiento predictivo (contra el kilometraje
  real de Traccar), sugerencia de reubicación (contra el promedio histórico
  de la hora), eficiencia por ruta/empresa, eventos de conducción
  (frenadas bruscas, solo como evidencia, sin ranking todavía).
- **Recaudación por empresa** — vista consolidada agrupada por empresa
  miembro (en Operación, cada unidad solo ve la suya).

### Importante: lo que el Administrador NUNCA ve, tenga o no PRO

- **GPS Vehicular individual de un socio** (cuando la asociación NO tiene
  PRO pero un socio pagó GPS para su propia unidad): es privado del socio.
  El Administrador no ve el menú, ni las alertas, ni nada. El rol de
  "controlador" en ese caso lo cumple Super Admin (correo + su propio
  Resumen), nunca el Administrador. Es una decisión de producto explícita,
  no un hueco.
- **Bloqueo remoto de motor**: el Administrador nunca lo solicita ni lo
  confirma — es un flujo exclusivo Socio (solicita) → Super Admin (confirma).

## 3. Socio

Panel de escritorio del dueño de la(s) unidad(es). Ve **solo lo suyo**, nunca
el resto de la flota de la asociación.

### Disponible siempre (Plan Operación)

- **Resumen** — vista general de sus unidades.
- **Mis unidades** — sus vehículos, conductor(es) asignado(s).
- **Viajes** — viajes de sus propias unidades.
- **Manifiestos** — de sus unidades (no ve manifiestos de otras).
- **Producción** — recaudación y vueltas de sus unidades.
- **Incidencias** — reportadas sobre sus unidades.
- **Avisos** — solo lectura, filtrados por audiencia "socios".

### GPS Vehicular — depende de la UNIDAD, no de la asociación

A diferencia del Administrador, el Socio ve GPS de una unidad suya si esa
unidad **tiene el dispositivo vinculado**, sin importar si la asociación
completa tiene PRO o no — puede ser una contratación individual solo de esa
unidad (`plan-gps-vehicular.md`). Si aplica, se agrega:

- **GPS de mi unidad** — posición en vivo, señal, energía, ignición.
- **Historial GPS** — recorridos y kilometraje reales.
- **Alertas GPS** — de su(s) propia(s) unidad(es).
- **Bloqueo de motor** — el Socio **solicita** el bloqueo de su propia
  unidad (motivo obligatorio); **solo Super Admin** confirma, cancela o
  restaura — el Socio nunca ejecuta el bloqueo directamente, y el
  Administrador de la asociación no participa en este flujo.
- **Plan GPS** — estado de su contratación individual (incluida en PRO de la
  asociación, o pagada aparte si la asociación sigue en Operación).

## 4. Conductor

Pensado para celular — quien está manejando en ruta o parado en terminal.

### Disponible siempre (Plan Operación)

- **Inicio** — dice en qué terminal está ("Estás en Juli"/"Estás en Puno"),
  inferido del viaje/cola/último viaje, sin que el conductor elija nada.
- **Cola** — inscribirse, "No saldré ahora", marcar salida. Tres condiciones
  se validan juntas al presionar "Inscribirme": confirmación GPS de
  terminal, tiempo mínimo desde la salida (no es una ETA, solo habilita el
  botón), y que el vehículo anterior esté resuelto.
- **Manifiesto** — solo se prepara y guarda estando LLAMANDO, nunca en
  movimiento. Puede quedar "pendiente de digitalizar" en casos excepcionales
  (reubicación, demanda alta) con respaldo en papel.
- **Mis viajes** — solo su viaje activo y sus propios manifiestos vacíos de
  hoy. No ve su historial de manifiestos ya cerrados (eso es de
  Administrador, Socio dueño y Super Admin).
- **Avisos** — solo lectura, filtrados por audiencia "conductores".
- **Mi perfil** — datos propios, mini-mapa privado de su ubicación en vivo
  (nunca compartido con nadie, nunca guardado como historial, activable por
  asociación desde Super Admin por costo de la API de Google Maps).
- **Botón de alerta** — para averías/choques reales; el Administrador
  resuelve la excepción manualmente.

### Se agrega con Plan PRO (solo si su unidad tiene GPS físico)

- **GPS de mi unidad** — cuando el vehículo tiene dispositivo Teltonika
  vinculado, la verificación de llegada usa la posición real del GPS en vez
  del GPS del celular — el conductor sigue siendo quien decide presionar
  "Inscribirme", el hardware nunca inscribe solo.
- **Reportar falla GPS** / **Reportar emergencia** — ya probados en vivo,
  generan alerta real para el Administrador.

### Pendiente, no construido todavía (exclusivo PRO)

- **Asistente por WhatsApp Business** — solo para conductores (incluido el
  socio-conductor mientras maneja). Responde sobre la cola general y datos
  personales (turno, vueltas, recaudación por rango de fechas). Dejado a
  propósito para el final del roadmap — requiere integración paga con Meta/
  Twilio/360dialog, no es solo código sobre datos que ya existen.

## 5. Resumen — qué cambia entre Operación y PRO, por rol

| | Administrador | Socio | Conductor |
|---|---|---|---|
| Colas, manifiestos, viajes, reubicaciones | Igual en ambos planes | Igual en ambos planes | Igual en ambos planes |
| GPS de flota completa | Solo si la asociación tiene PRO | — | — |
| GPS de su(s) propia(s) unidad(es) | — | Si esa unidad tiene GPS (con o sin PRO de la asociación) | Igual que Socio |
| Bloqueo de motor | Nunca participa | Solicita (Super Admin confirma) | No aplica |
| Asistente AI (panel) | Solo con PRO | No tiene | No tiene |
| Asistente por WhatsApp | No aplica | No aplica | Pendiente de construir, solo PRO |
| Recaudación consolidada por empresa | Solo con PRO | No aplica (ve la suya siempre) | No aplica |
| Reportes avanzados (mantenimiento, eficiencia) | Solo con PRO | No tiene | No tiene |
| Avisos | Redacta y envía, ambos planes | Solo lectura, ambos planes | Solo lectura, ambos planes |
| Soporte a CHASKI AI | Sí, ambos planes | No tiene | No tiene |
