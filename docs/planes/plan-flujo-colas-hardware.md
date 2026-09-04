# Flujo de colas: Marcar salida / Inscribirme (Operación y PRO)

Este documento define el flujo real de cómo un conductor pasa por la cola de
ida, viaja, y se re-inscribe en la cola de vuelta — con **el mismo flujo para
Plan Operación y Plan PRO**, la única diferencia es de dónde sale la
evidencia GPS al momento de inscribirse de vuelta (celular del conductor vs.
hardware Teltonika del vehículo). Diseñado en conversación directa con Jayde
(CHASKI AI) — ver `queues.service.ts`, `trips.service.ts`,
`manifests.service.ts` y `DriverApp.tsx` para la implementación real.

Este documento complementa `plan-operacion.md` §3 (integridad de
cola/manifiesto/antifraude) y `plan-gps-vehicular.md` (el hardware). No
repite esas reglas — solo agrega el flujo de salida/re-inscripción.

> **Corrección (4 de septiembre de 2026), tras la prueba real en vivo con
> ATIPCAR:** tres cambios de fondo sobre la versión anterior de este
> documento:
>
> 1. **Se elimina el timeout automático.** LLAMANDO no vence nunca por el
>    paso del tiempo — solo "Marcar salida" saca a una unidad de esa
>    posición. Ver `plan-operacion.md` §3.6.
> 2. **LLAMANDO deja de ser una acción manual de rutina del administrador.**
>    Se asigna únicamente de forma automática cuando la cola queda vacía
>    (la siguiente unidad pasa sola a LLAMANDO). El administrador solo la
>    asigna manualmente en un caso de excepción real: accidente, robo,
>    celular perdido u otro incidente que le impida al conductor operar con
>    normalidad.
> 3. **Se elimina el botón separado "Marcar llegada".** Ya no existen dos
>    pasos (llegar y luego inscribirse). El GPS se comprueba **dentro** del
>    mismo paso de "Inscribirme" en la cola contraria — ver el paso 6 más
>    abajo.
>
> Los pasos de este documento ya reflejan estos tres cambios como la regla
> vigente. La sección 7 al final distingue qué de esto ya está en el código
> y qué falta ajustar.

## 1. Regla central: un solo flujo, la fuente del GPS cambia

Plan Operación y Plan PRO comparten exactamente los mismos pasos para el
conductor. Lo único que cambia es **de dónde sale la posición GPS al
inscribirse en la cola de regreso**:

- **Plan Operación**: GPS del celular del conductor (un chequeo puntual, no
  rastreo continuo — igual que la confirmación de llegada a cola, §3.3 de
  `plan-operacion.md`).
- **Plan PRO** (con hardware Teltonika ya vinculado a esa unidad en
  Flota → GPS): GPS real del vehículo, leído del servidor Traccar. El
  hardware reemplaza al celular como fuente de verdad de ubicación, pero
  **no inscribe solo** al vehículo por entrar a una geocerca — el conductor
  sigue siendo quien decide presionar "Inscribirme" o "No saldré ahora"
  (corrección también aplicada en `plan-pro.md` §3).

Si una unidad está en Plan PRO pero *esa unidad en particular* todavía no
tiene hardware vinculado (`Vehicle.traccarDeviceId` vacío), el sistema usa
el celular como respaldo automático — el hardware se instala
progresivamente, unidad por unidad, no de golpe para toda la asociación.

Esto se refleja en el campo `Trip.gpsStatus` (`SIN_GPS` / `REGISTRO_MOVIL` /
`GPS_FISICO`).

## 2. El flujo completo, paso a paso (ida y vuelta)

1. **El vehículo se inscribe al final de la cola.** Si la cola de esa
   dirección está vacía, pasa automáticamente a LLAMANDO — sin que el
   administrador tenga que hacer nada.
2. **En cuanto está LLAMANDO** (y solo mientras está LLAMANDO — nunca antes
   ni en un estado posterior), el conductor entra a Manifiesto en su panel.
   El sistema le prepara automáticamente un viaje en estado `PROGRAMADO`
   (todavía no ha salido — es solo el contenedor donde se llena el
   manifiesto) y le abre el formulario de manifiesto.
3. **Llena los datos de los pasajeros y guarda el manifiesto** (cierra el
   manifiesto — genera el PDF, se puede compartir por WhatsApp). No hace
   falta completar los 20 asientos, pero un viaje comercial debe llevar su
   manifiesto con los pasajeros reales que lleva.
4. **El conductor presiona "Marcar salida."** En ese momento (y solo en ese
   momento):
   - El viaje pasa de `PROGRAMADO` a `ACTIVO` (EN RUTA).
   - Se registra la hora real de salida (`actualDeparture`).
   - Empieza el contador de 60 minutos — el tiempo mínimo que debe pasar
     antes de poder inscribirse en la cola de regreso (`plan-operacion.md`
     §3.4). **Este contador no es una hora estimada de llegada** y no debe
     mostrarse como tal en el panel del conductor.
   - La unidad sale de la cola de ida.
   - **La siguiente unidad de la cola pasa automáticamente a LLAMANDO** —
     de nuevo, sin intervención del administrador.
5. **El conductor viaja.** No hay rastreo continuo en ningún plan para
   efectos de la cola — ni en Operación (nunca lo hubo) ni en PRO (el mapa
   GPS en vivo es una pantalla aparte para el administrador). PRO sí tiene
   telemetría continua del vehículo a nivel de plataforma (historial,
   geocercas, alertas — ver `plan-pro.md`), pero la cola solo consulta la
   ubicación en el momento de inscribirse, no antes.
6. **El conductor decide inscribirse en la cola de regreso.** No existe un
   botón separado de "Marcar llegada" — al presionar **"Inscribirme"** el
   sistema valida, en un solo paso, las tres condiciones obligatorias de
   `plan-operacion.md` §3.4/§3.3/§3.5:
   - Pasaron los 60 minutos desde que marcó salida.
   - El GPS confirma que está en la terminal de destino (celular en
     Operación; hardware Traccar en PRO si esa unidad ya lo tiene
     vinculado).
   - El vehículo que salió antes que él en esa misma dirección ya está
     resuelto: se inscribió de verdad, presionó "No saldré ahora", o fue
     liberado por autorización administrativa (§3 más abajo).

   Si falla cualquiera de las tres, el sistema se lo indica puntualmente
   (por ejemplo, el mensaje de candado de predecesor de la sección 3).
7. **Si el conductor no quiere regresar todavía**, debe presionar
   expresamente **"No saldré ahora"** — no hacer nada bloquea al siguiente
   vehículo en la cadena de predecesores (§3). Es la misma acción que ya
   existe como "me inscribo más tarde" en el panel de Cola, y también está
   accesible desde Inicio.

## 3. El candado duro de orden real de salida (cadena de predecesores)

**Una unidad no puede inscribirse en la cola de regreso si otra unidad que
salió antes que ella en la ida todavía no resolvió su propia situación** —
ni se inscribió, ni presionó "No saldré ahora", ni fue liberada por el
administrador.

Ejemplo real (como lo explicó Jayde): la unidad 003 salió de Juli antes que
la 004. Ambas llegan a Puno. La 004 termina su manifiesto de vuelta primero
y quiere anotarse en la cola Puno→Juli — pero el sistema se lo bloquea con
un mensaje así:

> "Aún no puedes inscribirte — la unidad 003 no se ha inscrito todavía.
> Contáctate con el administrador de tu asociación."

Desde ahí, la 004 tiene el botón **"Inscripción retrasada"** en su panel:
lo presiona, el administrador recibe la notificación y decide entre dos
caminos — llamar al predecesor para que se anote, o autorizar la
inscripción de la 004 igual. (Si en cambio la 003 se inscribe o presiona
"No saldré ahora" por su cuenta, el botón "Inscribirme" de la 004 se
habilita solo, sin que nadie tenga que intervenir.)

Este candado se implementa en `queues.service.ts` → `join()`, reutilizando
la hora real de salida (`actualDeparture`) del último viaje completado por
cada unidad en la dirección contraria.

### El rol del administrador es solo de excepción

El administrador **no interviene en el día a día normal de la cola** — ni
para asignar LLAMANDO, ni para forzar el orden de re-inscripción. Su
trabajo es únicamente para los casos de excepción:

- **Accidente, robo o celular perdido/cambiado en ruta:** el conductor (o
  quien lo reporte) contacta al administrador, quien puede:
  1. Reasignar el dispositivo vinculado a la cuenta del conductor, para que
     siga operando desde otro celular (`plan-operacion.md` §3.2).
  2. Si de plano la unidad no puede operar, colocarla manualmente en
     LLAMANDO o resolver su situación por intervención manual (vía 2 del
     escape de `plan-operacion.md` §3.6).
- **Unidad bloqueada por un predecesor sin resolver:** resuelve la
  solicitud de "Inscripción retrasada" que el conductor bloqueado envió
  desde su panel (ver arriba).
- **Accidente o incidencia en ruta:** sigue el flujo ya existente del botón
  de alerta (`plan-operacion.md` §3.7) y resolución manual del gerente.

## 4. Qué pasa con el manifiesto y el viaje `PROGRAMADO`

El manifiesto se llena *antes* de marcar salida, no después — el esquema ya
tenía todo lo necesario para esto sin campos nuevos:

- `Trip.status` ya incluía `PROGRAMADO` como estado previo a `ACTIVO`.
- `Manifest.tripId` ya era opcional/único — un manifiesto puede existir
  atado a un viaje que todavía no ha salido.

En cuanto está LLAMANDO (y solo en ese estado — corrección del 4 de
septiembre), el conductor obtiene un viaje `PROGRAMADO` (sin
`actualDeparture` todavía) donde abre y cierra su manifiesto con
normalidad. "Marcar salida" es lo que transiciona ese mismo viaje a
`ACTIVO` — no crea un viaje aparte.

El administrador conserva la posibilidad de despachar una unidad
directamente para un caso de excepción real (no como atajo de rutina) —
mismo botón que ya existía en Colas.

## 5. Manifiesto vacío con respaldo en papel — alcance acotado

**Corrección (4 de septiembre de 2026):** cerrar un manifiesto vacío con
respaldo físico en papel (`plan-operacion.md` §3.8) **solo corresponde a
una reubicación, o a una demanda real de pasajeros que no da tiempo de
digitar en el momento** — no es una salida válida de rutina para evitar
llenar el manifiesto en un viaje normal.

## 6. Lo que este documento explícitamente NO cambia

- No hay rastreo continuo en ningún plan a nivel de cola — el mapa GPS en
  vivo (`GET /gps/live`) es una pantalla aparte para el administrador. PRO
  sí tiene telemetría continua del vehículo (historial, geocercas, alertas)
  a nivel de plataforma — eso no es parte de este flujo de cola.
- No se agregó ningún campo nuevo a la base de datos — todo se construye
  con el esquema (`Trip`, `Manifest`, `QueueEntry`, `OperationalConfig`,
  `DelayedRegistrationRequest`) que ya existe.

## 7. Estado real en el código vs. esta corrección (4 de septiembre de 2026)

Ya construido y probado en vivo antes de esta corrección:

- Auto-LLAMANDO cuando la cola queda vacía (`maybeAutoPromote()`).
- "No saldré ahora" / "me inscribo más tarde" como retiro completo de la
  cola (`withdrawFromQueue()`).
- Reasignación de dispositivo por el administrador (Excepción de celular
  perdido/robado/cambiado).
- "Inscripción retrasada": botón del conductor, notificación y las dos
  opciones de resolución del administrador.

Pendiente de ajustar en el código para que calce con esta corrección (no
tocar todavía, solo queda registrado aquí):

- Quitar el timeout automático (`sweepTimeouts`, `demoteToBack` por
  vencimiento) — LLAMANDO no debe vencer nunca.
- Restringir `prepareTrip()` a únicamente el estado LLAMANDO (hoy acepta
  "LLAMANDO o más adelante en la fila interna").
- Eliminar el botón/paso separado de "Marcar llegada" (`trips.service.ts`
  → `complete()`, botón en `DriverApp.tsx`) y mover esa validación de GPS
  al propio `join()`, junto con el contador de 60 minutos como condición
  de inscripción (no como ETA mostrada en pantalla).
- Reubicaciones: exención del tiempo mínimo y orden por llegada real (GPS)
  ajustado al orden que marcó el administrador.
