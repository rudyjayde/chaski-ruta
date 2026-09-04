# Plan Operación

Fuente: Documento Maestro §7.1, §9, §10, ampliado con el diseño de integridad de cola/manifiesto acordado en conversación de producto (agosto 2026), y corregido el 4 de septiembre de 2026 tras la prueba real en vivo con ATIPCAR (ver §3.4 y §3.6 — se elimina el timeout automático de LLAMANDO). Los precios y políticas de tolerancia definitivas siguen pendientes de aprobación formal — ver "Pendientes" al final.

## 1. Qué es

Plan base de la asociación: digitaliza y controla la operación **sin GPS físico continuo**. Es el plan que resuelve el dolor urgente (caos de colas, manifiestos y control de viajes) y por eso es la puerta de entrada obligatoria de cualquier asociación nueva.

## 2. Qué incluye (§7.1)

- Organización y empresas integrantes.
- Administrador, socios, conductores y cuentas por rol.
- Registro y vinculación de vehículos.
- Rutas, sentidos y terminales.
- Colas digitales por dirección.
- Posiciones LLAMANDO, RAMPA y EXTERIOR.
- Registro de pasajeros, mapa de asientos y medios de pago.
- Manifiesto, cierre, PDF y QR público de verificación.
- Salida, viaje, llegada y retorno a la cola contraria.
- Reubicaciones autorizadas.
- Reportes operativos y auditoría básica.
- Soporte según el contrato.

**No incluye** ubicación GPS física continua. Puede usar evidencia de cuenta, dispositivo o terminal, pero nunca debe mostrar coordenadas como si vinieran de un rastreador real.

## 3. Diseño de integridad de cola y antifraude

Este es el problema central de Operación: sin hardware GPS, ¿cómo se sabe que un vehículo llegó de verdad y le toca el turno que dice tener? El diseño acordado combina una regla dura (imposible de violar) con verificación probabilística (evidencia razonable, no prueba absoluta) y mecanismos de escape para no bloquear la operación real.

### 3.1 Regla dura universal (no depende del plan)

Un vehículo con viaje activo **no puede** entrar a la cola contraria hasta cerrar ese viaje. Este es el backstop de todo el sistema: aunque falle cualquier verificación de evidencia, esta regla nunca se rompe.

### 3.2 Vínculo cuenta-dispositivo

La cuenta de un conductor solo funciona desde el celular físico vinculado a esa cuenta. Evita que una cuenta se use desde varios dispositivos para simular presencia en dos lugares. Solo el administrador puede liberar esa vinculación (celular perdido, robado o cambiado) — nunca el propio conductor.

### 3.3 Verificación de llegada por GPS del celular

Chequeo puntual (una sola vez, no rastreo continuo) de la posición del celular, grounded en la redacción exacta de §7.1 del documento maestro ("puede utilizar evidencia de cuenta, dispositivo o terminal, pero nunca debe mostrar coordenadas como si provinieran de un rastreador"). No es rastreo — es una prueba puntual de presencia.

**Corrección (4 de septiembre de 2026):** esta verificación ya no vive en un botón separado de "Marcar llegada". Se comprueba en el mismo momento en que el conductor presiona "Inscribirme" en la cola contraria — ver el detalle completo en `plan-flujo-colas-hardware.md` §2.

### 3.4 Tiempo mínimo antes de re-inscripción (no es una hora estimada de llegada)

Gate configurable por ruta (parámetro de asociación — hoy 60 minutos para ATIPCAR) que exige que haya pasado ese tiempo mínimo desde que la unidad marcó salida, antes de poder inscribirse en la cola de regreso.

**Corrección (4 de septiembre de 2026):** este contador **no es una ETA** y no debe mostrarse en el panel del conductor como "llegada estimada en X min" — eso confunde el propósito del dato. Es puramente el tiempo mínimo que debe transcurrir para habilitar el botón "Inscribirme" de la cola contraria; el viaje real puede durar más o menos, el contador no predice cuándo llega, solo controla cuándo se habilita la inscripción de vuelta. Es una de las **tres condiciones obligatorias** para inscribirse (junto con la confirmación GPS de terminal, §3.3, y que el vehículo anterior esté resuelto, §3.5) — las tres se validan juntas al presionar "Inscribirme", no por separado.

Las reubicaciones están exentas de este gate (§3.9).

### 3.5 Cadena de predecesores

Para preservar el orden real de salida cuando varios vehículos llegan y se inscriben casi al mismo tiempo, la posición en la cola de regreso respeta el orden en que salieron originalmente (cadena de predecesores), no el orden en que tocan "inscribirme" en el celular. Un vehículo anterior queda "resuelto" para este propósito cuando se inscribió de verdad, presionó "No saldré ahora" (§3.6), o el administrador lo liberó por autorización manual (Excepción "Inscripción retrasada", §3.6).

### 3.6 Mecanismo de escape en 2 vías

**Corrección (4 de septiembre de 2026): se elimina el timeout automático.** La versión anterior de este documento describía un timeout como primera vía de escape (una unidad LLAMANDO que no confirmaba a tiempo se liberaba sola); quedó descartado tras confirmarlo con Jayde en la prueba real del 4 de septiembre. **LLAMANDO no vence nunca por el paso del tiempo** — una unidad permanece en LLAMANDO indefinidamente hasta que su propio conductor presiona "Marcar salida". El desbloqueo de una posición depende siempre de una acción explícita, nunca de un cronómetro.

Las dos vías reales para que una posición bloqueada no frene la operación:

1. **"No saldré ahora" / "Me inscribo más tarde"** — declaración explícita del propio conductor; siempre lo manda al final de la lista, nunca conserva prioridad. Es también lo que resuelve, para el vehículo siguiente, la condición de "vehículo anterior resuelto" (§3.5), sin que el conductor anterior tenga que inscribirse de verdad. Si el conductor simplemente no hace nada, bloquea al siguiente — no hay liberación pasiva.
2. **Intervención manual del gerente/administrador** — con motivo obligatorio y registro de auditoría (actor, fecha, motivo, cambio antes/después). Reservada para casos de excepción real (accidente, robo, celular perdido, unidad ilocalizable) — **nunca para la operación normal del día a día**. Incluye dos mecanismos ya construidos:
   - Reasignar el dispositivo vinculado a la cuenta del conductor, cuando cambia de celular (§3.2).
   - Resolver una solicitud de **"Inscripción retrasada"**: el conductor bloqueado por un predecesor sin resolver la envía desde su propio panel; el administrador recibe la notificación y decide si llama al predecesor para que se anote, o autoriza la inscripción igual.

Importante: la evidencia que aporta el propio conductor beneficiado (ej. captura de llamada) **nunca** decide por sí sola — ayuda al gerente a decidir más rápido, pero la decisión formal siempre es una acción explícita del conductor o una intervención manual del gerente. Nunca hay liberación automática por tiempo.

### 3.7 Botón de alerta / incidentes reales

Para averías, choques u otras emergencias reales en ruta: el conductor tiene un botón de alerta en su app. No se crea un nuevo estado de sistema — se reutiliza el mismo mecanismo de intervención manual del gerente (remover, reorganizar la lista) que ya existe para cualquier excepción. Una falla leve (llanta, demora de aviso) se trata como "llegó tarde"; un motivo grave lo resuelve el gerente removiendo o reorganizando.

Este es también el único caso en que el administrador coloca manualmente a una unidad en LLAMANDO fuera del ciclo normal — ver `plan-flujo-colas-hardware.md` §1: en el día a día, LLAMANDO se asigna únicamente de forma automática cuando la cola queda vacía.

### 3.8 Manifiesto

- **El manifiesto nunca se llena en movimiento.** Regla de seguridad sin excepción — el conductor no puede hacer registro de datos mientras conduce. El manifiesto debe cerrar antes de la salida, siempre.
- **Solo puede prepararse y guardarse estando LLAMANDO** — ni antes (no hay viaje que llenar) ni en un estado posterior. Corrección (4 de septiembre de 2026): no es "LLAMANDO o más adelante en la fila", es exclusivamente LLAMANDO.
- No es obligatorio completar los 20 asientos, pero un viaje comercial debe llevar su manifiesto con los pasajeros reales que lleva.
- Bajo presión real, un manifiesto vacío con respaldo físico en papel **solo corresponde a una reubicación o a una demanda real de pasajeros que no da tiempo de digitar** — no es una salida de rutina para evitar llenar el manifiesto.
- La digitalización de ese respaldo en papel no es opcional indefinidamente: necesita un estado tipo "pendiente de digitalizar" con una ventana de resolución, para no debilitar la verificación por QR.
- **Visibilidad del manifiesto para el conductor:** solo ve su manifiesto activo actual y sus propios manifiestos vacíos/pendientes de esa jornada. No ve su propio historial de manifiestos ya cerrados, ni los de otros conductores — eso queda reservado a administrador, socio dueño de la unidad y Super Admin (§6.2 del documento maestro).

### 3.8.1 Regla global de datos de identidad de pasajero (Jayde, agosto 2026)

Aplica a **todo formulario del sistema que registre a una persona** (pasajero de manifiesto hoy; socio/conductor cuando Personas se conecte al backend real más adelante) — no es un ajuste de una sola pantalla:

- **Nombre en dos campos separados:** "Nombres" y "Apellidos", nunca un solo campo de texto libre. Se guarda combinado, pero se captura por separado por formalidad/estética.
- **DNI:** exactamente 8 dígitos numéricos, sin letras ni guiones — validado tanto en el formulario (solo acepta dígitos, máximo 8) como en el backend (rechaza cualquier otro formato). Ya aplicado en `AddPassengerDto` (backend) y en el formulario de "Agregar pasajero" del manifiesto (admin). Falta aplicarlo cuando Personas/Socios se conecte al backend real.

### 3.9 Reubicaciones

- **Selección:** el administrador ve ambas colas (Juli→Puno y Puno→Juli) y elige manualmente los códigos de las unidades a reubicar, enviándolas vacías desde la terminal con mayor acumulación hacia la de mayor demanda. No hay flujo de "propuesta y aceptación" por unidad — es una decisión directa del administrador.
- **Compensación económica:** se registra en el historial de vueltas del conductor como "vacío/sin cobro" cuando el administrador lo selecciona para una reubicación. El monto de compensación económica en sí sigue sin definirse (pendiente §13).
- **Exención del tiempo mínimo:** las unidades reubicadas se saltan el gate de tiempo mínimo de §3.4 — pueden inscribirse en la cola de destino antes de que pasen los 60 minutos.
- **Orden en destino:** se posición de cada unidad reubicada respeta el orden con que el administrador las marcó al ordenar la reubicación, pero validado contra su llegada real confirmada por GPS — no es un orden ciego elegido de antemano, se ajusta a cuándo llegó cada una de verdad. Nunca altera a quienes ya esperaban en el destino antes de la reubicación.

### 3.10 Parámetros configurables vs. lógica fija

| Configurable por asociación (Super Admin, al crear la asociación) | Fijo / universal (no cambia por asociación) |
|---|---|
| Tiempo mínimo antes de re-inscripción por ruta (§3.4) | Regla dura de secuencia (no dos colas con viaje activo) |
| Radio GPS aceptado para "confirmar llegada" | Cadena de predecesores |
| Umbral de anomalía (velocidad/patrón sospechoso) | LLAMANDO no vence — solo "Marcar salida" lo cierra (sin timeout) |
| | "No saldré ahora" → siempre al final de la lista |
| | Intervención manual con motivo obligatorio como única vía de escape restante |

### 3.11 Pantalla de Inicio del conductor — en qué terminal está parado

✅ Construido (agosto 2026). Requisito de producto explícito de Jayde, probando el flujo real de Colas: la pantalla de Inicio del conductor dice claramente en qué terminal está — "Estás en Juli" o "Estás en Puno" — inferido con viaje activo > cola activa > último viaje completado (sin GPS físico, sin que el conductor tenga que elegir nada). "Inicio" ya consume el backend real (colas + viajes) en vez de demo.ts; "Resumen de hoy" solo muestra vueltas completadas — pasajeros y recaudación del día se dejan en blanco a propósito, porque el conductor no ve el detalle de sus manifiestos ya cerrados (§3.8).

## 4. Extra: mini-mapa de ubicación en vivo del conductor

Función adicional (no ligada a la integridad de cola) ya implementada en el código: un mini-mapa privado con la ubicación en vivo del conductor dentro de su propio perfil, usando la API de Google Maps. Es puramente para la experiencia del conductor — nunca influye en la cola, nunca se comparte con gerente/socio, nunca queda guardado como historial. Activable/desactivable por asociación desde el panel de Super Admin (por costo de la API de Google Maps si hiciera falta apagarlo).

## 5. Estado de aprobación de gobernanza

El documento maestro (§9, §13) exige que ATIPCAR apruebe formalmente estas políticas de tolerancia antes de automatizarlas. El gerente de ATIPCAR ya dio su aceptación en principio a este diseño, y confirmó personalmente la corrección del 4 de septiembre de 2026 (sin timeout, condiciones de re-inscripción, fusión de "marcar llegada" en "inscribirme"). Queda pendiente que el panel de Super Admin permita ajustar estos parámetros (tiempo mínimo, radio GPS, umbral de anomalía) para asociaciones futuras, en caso de que necesiten valores distintos a los de ATIPCAR.

## 6. Pendientes que no deben inventarse (heredados del documento maestro §13)

- Precio definitivo de Operación.
- Política aprobada de ausencia y tolerancia en colas (formalización final más allá del acuerdo de principio ya dado).
- Fórmula de compensación económica por reubicaciones.
