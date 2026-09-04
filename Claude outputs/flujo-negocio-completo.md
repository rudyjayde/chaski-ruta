# CHASKI RUTA — Flujo de negocio completo (ATIPCAR)

**Corregido y confirmado con Jayde el 4 de septiembre de 2026**, tras la prueba real en vivo con las unidades 001 y 003. Este documento reemplaza como fuente de verdad cualquier versión anterior sobre el flujo de colas — las contradicciones que tenía quedan resueltas aquí. El detalle técnico completo vive en `docs/planes/plan-operacion.md`, `plan-flujo-colas-hardware.md` y `plan-pro.md`; este archivo es el resumen único y legible de todo eso junto.

## 1. Roles

- **Super Admin (CHASKI AI):** crea asociaciones, activa planes, configura parámetros.
- **Administrador/gerente de la asociación (ej. ATIPCAR):** gestiona vehículos, personas, resuelve excepciones. No interviene en el día a día normal de la cola.
- **Socio:** dueño de una o más unidades.
- **Conductor:** opera la cola, el manifiesto y los viajes desde su propio panel — es autónomo desde que lo llaman.

## 2. El flujo normal, paso a paso

1. **El vehículo se inscribe al final de la cola** de su dirección (Juli→Puno o Puno→Juli).
2. **Si la cola está vacía, pasa automáticamente a LLAMANDO** — sin que el administrador haga nada.
3. **Solo estando LLAMANDO** el conductor puede preparar y guardar su manifiesto (ni antes, ni en otro estado).
4. **No hace falta completar los 20 asientos**, pero un viaje comercial debe llevar su manifiesto con los pasajeros reales que transporta.
5. **La unidad permanece LLAMANDO hasta que el conductor presiona "Marcar salida" — no existe timeout.** No hay ningún cronómetro que la libere sola por inactividad.
6. **Al marcar salida:**
   - El viaje pasa a EN RUTA (`ACTIVO`).
   - Empieza el contador de **60 minutos** — el tiempo mínimo que debe pasar antes de poder inscribirse en la cola de regreso. **No es una hora estimada de llegada**, no debe mostrarse como "llegada estimada en X min": el viaje real puede durar más o menos, el contador solo controla cuándo se habilita la re-inscripción.
   - La siguiente unidad de la cola pasa automáticamente a LLAMANDO.
7. **Para inscribirse en la cola contraria deben cumplirse las tres condiciones juntas:**
   - Pasaron los 60 minutos desde que marcó salida.
   - El GPS confirma que está en la terminal de destino (celular en Plan Operación; hardware del vehículo en Plan PRO).
   - El vehículo anterior en esa misma dirección ya está resuelto: se inscribió de verdad, presionó "No saldré ahora", o fue liberado por autorización administrativa.
8. **No existe un botón separado de "Marcar llegada."** El GPS se comprueba dentro del mismo paso de presionar "Inscribirme" — no son dos pasos, es uno solo.
9. **Si el conductor no quiere regresar todavía, debe presionar expresamente "No saldré ahora."** Si simplemente no hace nada, bloquea al siguiente vehículo de la cadena.
10. **Si está bloqueado porque el vehículo anterior no resolvió su situación**, presiona **"Inscripción retrasada"** — el administrador recibe la notificación y decide: llama al predecesor para que se anote, o autoriza la inscripción igual.
11. **Reubicaciones:** el administrador ve ambas colas, elige manualmente los códigos de las unidades y las envía vacías desde la terminal con mayor acumulación hacia la de mayor demanda. No hay propuesta/aceptación por unidad.
12. **Las unidades reubicadas se saltan los 60 minutos.** Su posición en destino respeta el orden con que el administrador las marcó al ordenar la reubicación, ajustado a su llegada real confirmada por GPS.
13. **Plan Operación usa el GPS puntual del celular; Plan PRO usa el hardware del vehículo** (una vez instalado en esa unidad) — el flujo de inscripción es exactamente el mismo en ambos, solo cambia de dónde sale la posición.

## 3. El rol del administrador — solo de excepción

El administrador **no interviene en la operación normal del día a día** — ni asigna LLAMANDO a mano, ni fuerza el orden de la cola. Su trabajo es únicamente para casos de excepción:

- **Accidente, robo o celular perdido/cambiado en ruta:** puede reasignar el dispositivo vinculado a la cuenta del conductor (para que siga operando desde otro celular), o si la unidad de plano no puede operar, resolver su situación manualmente. Este es también el único caso normal en que LLAMANDO se asigna a mano.
- **"Inscripción retrasada":** resuelve la solicitud que envía el conductor bloqueado por un predecesor sin resolver.
- **Incidencias en ruta:** botón de alerta del conductor → resolución manual del gerente.

Toda intervención manual queda registrada con motivo obligatorio y auditoría (actor, fecha, motivo, cambio antes/después).

## 4. Manifiesto

- Nunca se llena en movimiento — debe cerrar antes de la salida, siempre.
- Solo se prepara y guarda mientras la unidad está LLAMANDO.
- No hace falta llenar los 20 asientos, pero debe reflejar los pasajeros reales del viaje comercial.
- Un manifiesto vacío con respaldo físico en papel **solo corresponde a una reubicación, o a una demanda real de pasajeros que no da tiempo de digitar en el momento** — no es una salida válida de rutina.
- El conductor solo ve su manifiesto activo actual y sus manifiestos vacíos/pendientes del día — no su historial ya cerrado, ni el de otros conductores.

## 5. Operación vs. PRO

Comparten exactamente el mismo flujo de cola. La única diferencia es de dónde sale la posición GPS al momento de inscribirse de vuelta:

- **Operación:** celular del conductor (chequeo puntual, no rastreo continuo).
- **PRO:** hardware Teltonika del vehículo (lectura real de Traccar). El hardware reemplaza al celular como fuente de verdad — **nunca reemplaza la decisión del conductor**: entrar a la geocerca de la terminal no lo inscribe solo, sigue teniendo que presionar "Inscribirme" o "No saldré ahora".

PRO además da mapa de flota en vivo, historial de recorridos, geocercas y alertas a nivel de plataforma — eso no forma parte del flujo de cola, es visibilidad adicional para el administrador.

## 6. Qué ya está construido y probado en vivo

- Auto-LLAMANDO cuando la cola queda vacía.
- "No saldré ahora" / "me inscribo más tarde" como retiro completo de la cola.
- Reasignación de dispositivo por el administrador (celular perdido/robado/cambiado).
- "Inscripción retrasada": botón del conductor, notificación al administrador, y sus dos formas de resolución.
- Generación de número de manifiesto sin colisiones (corregido el 4 de septiembre de 2026).

## 7. Pendiente de ajustar en el código para que calce con este documento

*(No implementado todavía — este documento define la regla; el código se ajusta después, punto por punto.)*

- Quitar el timeout automático de LLAMANDO.
- Restringir "preparar manifiesto" a únicamente el estado LLAMANDO.
- Eliminar el botón/paso separado de "Marcar llegada" y mover esa validación de GPS al propio "Inscribirme", junto con el contador de 60 minutos como condición de inscripción (no como ETA mostrada en pantalla).
- Reubicaciones: exención del tiempo mínimo y orden por llegada real (GPS) ajustado al orden que marcó el administrador.

## 8. Pendiente de definir (no inventar)

- Precio definitivo de Plan Operación, PRO y GPS Vehicular.
- Política formal de ausencia y tolerancia en colas (más allá del acuerdo de principio ya dado).
- Fórmula de compensación económica por reubicaciones.
- Comportamiento de una unidad PRO ante pérdida de señal GPS al momento de inscribirse.
