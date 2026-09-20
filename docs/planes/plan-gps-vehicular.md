# GPS Vehicular por unidad

Fuente: Documento Maestro §7.3, §7.4, §8. Este es el complemento que compra un **socio individual** para su(s) vehículo(s), independiente de si la asociación como tal tiene PRO o sigue en Operación.

## 1. Qué es

GPS Vehicular permite que un socio controle una o varias unidades propias aunque ATIPCAR (la asociación) permanezca en Operación. La decisión de comprarlo no depende del gerente ni de la asociación — depende del dueño del vehículo.

## 2. Qué incluye por unidad contratada (§7.3)

- Equipo Teltonika compatible instalado y configurado (modelo recomendado FMC130, sujeto a validación técnica).
- SIM, conectividad y plataforma según cotización.
- Vinculación por IMEI al vehículo, **nunca** al conductor.
- Ubicación actual o última posición válida.
- Estado de señal, energía e ignición.
- Historial de recorridos, paradas y kilómetros.
- Alertas configuradas para el propietario.
- Reportes por unidad y periodo.
- Historial de conductores asignados.
- Recordatorios de mantenimiento cuando se implementen.
- Soporte del dispositivo y la conectividad según contrato.

## 3. Beneficio para el conductor asignado

Mientras su asignación al vehículo esté activa, el conductor recibe acceso limitado a:

- Estado GPS de la unidad actual.
- Mapa y última posición válida relacionada con su operación.
- Recorrido de sus propios turnos o viajes.
- Avisos de llegada/salida de terminal cuando correspondan.
- Reporte de falla GPS, desconexión o emergencia.

El conductor **no puede**: ver la facturación del socio, configurar geocercas globales, ver recorridos de otros conductores o anteriores a su asignación, cambiar IMEI/SIM/dispositivo/contrato, ni consultar otras unidades del socio que no tenga asignadas.

Cuando termina la asignación, el conductor pierde ese acceso. El nuevo conductor lo recibe automáticamente al ser vinculado.

## 4. Visibilidad del administrador sin PRO

**Diseño original (documento maestro), DESCARTADO (12 de septiembre de 2026, decidido con Jayde):** el documento maestro sugería que el gerente pudiera ver que una unidad tiene "GPS particular", el estado administrativo de la vinculación y las incidencias autorizadas, aunque la asociación siguiera en Operación. Se decidió **no hacerlo así**: el GPS Vehicular es un producto privado que paga el socio directamente, y el Administrador de la asociación no tiene por qué ver nada de eso — ni el menú, ni las incidencias/alertas, ni el simple hecho de que existe.

**Decisión final y estado real del código:** el panel del Administrador (`AdminApp.tsx`, `isPRO = org?.plan === 'PRO'`) oculta el menú de GPS **completo** (GPS en vivo, Historial, Dispositivos GPS, Alertas, Corredor autorizado) apenas la asociación no está en PRO — sin excepción por unidad, y esto es intencional, no un hueco a corregir. El rol de "controlador" que antes se pensaba para el Administrador en este escenario lo cumple **Super Admin**: cuando ocurre una alerta grave (botón de pánico, posible remolque, posible accidente, fuera de ruta) en una unidad con GPS Vehicular individual de una asociación sin PRO, se notifica a Super Admin por correo y en su Resumen (ver `plan-pro.md` §13), nunca al Administrador.

Esto SÍ funciona igual para Socio y Conductor: su menú de GPS se muestra según si **su propia unidad** tiene `traccarDeviceId` vinculado (`hasVehicleGPS` en `PartnerApp.tsx`/`DriverApp.tsx`), totalmente independiente del plan de la asociación — un socio con GPS Vehicular ve su unidad aunque la asociación nunca haya tenido PRO.

### 4.1 Canal principal (agregado 8 de septiembre de 2026)

La aplicación nativa (Flutter, pendiente de construir — ver
`plataformas-web-y-app-nativa.md`) será el canal principal del socio para
consultar su unidad con GPS Vehicular. La app del conductor asignado puede
mostrar la información limitada de §3 mientras su asignación esté vigente.
Hasta que la app nativa exista, esto se consulta desde el portal web del
socio.

## 5. Migración si ATIPCAR contrata PRO

- El dispositivo y el historial de la unidad se conservan.
- La unidad se incorpora al alcance GPS de la asociación.
- El socio mantiene la consulta de su vehículo.
- Se ajusta la facturación para evitar doble cobro por el mismo servicio y periodo.
- El acceso del conductor sigue dependiendo de su asignación vigente.

*(Nota: en el código actual no existe ninguna pantalla ni cálculo para esta migración — el botón que solo cambiaba un texto se eliminó el 12 de septiembre de 2026 junto con el resto del flujo comercial simulado (§6.1). El prorrateo/fecha de corte reales siguen sin construirse. Ver `plan-pro.md` §10.)*

## 6. Flujo comercial y técnico (§8)

### 6.1 Solicitud y pago

1. La asociación solicita PRO, o el socio cotiza GPS Vehicular directamente.
2. CHASKI AI define equipos, unidades, instalación, SIM, conectividad y precio.
3. El cliente paga por el canal aprobado, incluso transferencia bancaria si se acuerda.
4. El Super Admin registra y verifica el pago.
5. El pago verificado crea una orden de instalación; no activa por sí solo una posición GPS.

### 6.2 Instalación

1. CHASKI AI asigna un dispositivo de inventario.
2. Un técnico instala el Teltonika en el vehículo.
3. Se registran IMEI, SIM, APN, servidor, vehículo, fotos y responsable.
4. Se configura el envío de telemetría hacia Traccar.
5. Se comprueba ubicación, ignición, energía y frecuencia de reporte.
6. Se vincula el dispositivo a la unidad en CHASKI RUTA.
7. Se activa el derecho de acceso correspondiente.

El socio no debe configurar el hardware por su cuenta salvo que CHASKI AI apruebe un procedimiento asistido.

**Estado real del código (corregido 12 de septiembre de 2026):** §6.1 y §6.2 describen el flujo comercial/técnico ideal, pero **no existe ningún backend ni base de datos real detrás de él**. Las pantallas de Super Admin "Solicitudes GPS" e "Instalaciones GPS" eran datos de ejemplo hardcodeados (nunca leían ni escribían nada real) y **se eliminaron** (12 sept 2026, decidido con Jayde) en vez de dejarlas como simulación permanente. Lo único que hoy es real y efectivamente activa el acceso GPS de una unidad es que el Super Admin, directamente desde Asociaciones → editar → GPS (o desde Super Admin → GPS), escribe el IMEI real del dispositivo ya configurado — sin pasar por ningún estado de "solicitud" o "instalación" intermedio en el sistema. La instalación física en sí (pasos de §6.2) sí se hace en la realidad, siguiendo `instrucciones-de-conexion-gps.md`, pero no queda registrada como un flujo de pedidos dentro de la plataforma.

### 6.3 Arquitectura funcional

```text
Teltonika FMC130 -> red movil/SIM -> servidor Traccar
                  -> backend CHASKI AI -> permisos y reglas
                  -> web/app del socio, conductor o administrador
```

Traccar recibe y normaliza la telemetría. CHASKI AI conserva la identidad, el contrato, la relación vehículo-persona, los permisos, las alertas de negocio y la experiencia de usuario.

### 6.4 Pérdida de señal

- Mostrar "Sin señal".
- Mostrar fecha y hora de la última posición válida.
- No mover el marcador artificialmente.
- No afirmar que el vehículo sigue en ese punto.
- Registrar reconexión cuando vuelva la telemetría.
- Para inscribirse en la cola, la posición solo cuenta si es reciente (`gpsMaxAgeMinutes`); sin señal el conductor pide autorización al administrador para usar el GPS del celular — ver `plan-pro.md` §3, "Pérdida de señal al inscribirse".

## 7. Comparación resumida (§7.4)

| Capacidad | Operación | PRO asociación | GPS Vehicular |
|---|---|---|---|
| Cola digital y manifiestos | Sí | Sí | Usa el plan de la asociación |
| Viajes y reportes operativos | Sí | Sí | Consulta de la unidad |
| GPS físico | No | Flota contratada | Unidad contratada |
| Mapa en vivo | No | Gerente y permisos definidos | Socio y conductor limitado |
| Historial GPS | No | Flota contratada | Unidad contratada |
| Geocercas y alertas | No | Asociación | Propietario, según alcance |
| Titular del contrato | Asociación | Asociación | Socio por unidad |
| Activación | Super Admin | Super Admin | Super Admin tras instalación |

## 8. Notas de estrategia comercial (opinión, no está en el documento maestro)

GPS Vehicular es un buen "wedge" de adquisición: no depende de que toda una asociación decida — un solo socio con un carro nuevo, o que ya tuvo un problema (robo, accidente, disputa), puede comprarlo por su cuenta. Eso da ingreso y una unidad ya instrumentada dentro de la asociación, lo cual facilita después el argumento de venta de PRO al gerente ("ya tenemos varias unidades con GPS, solo falta que la asociación tome el resto").

**Tensión abierta a decidir:** si el gerente sin PRO ya ve que varias unidades tienen "GPS particular" (aunque sea sin mapa ni historial), eso puede bajarle el incentivo de pagar PRO — la parte visible del problema ("no sé dónde están mis carros") ya la estarían resolviendo los socios uno por uno, aunque el gerente no tenga acceso centralizado. Vale la pena decidir conscientemente cómo se comunica y se vende esto, para no canibalizar la conversión a PRO.

## 9. Pendientes que no deben inventarse (heredados del documento maestro §13)

- Precio definitivo de GPS Vehicular.
- Duración mínima, garantía, SLA y política de reposición del hardware.
- Proveedor, costo y límites del plan de datos SIM.
- Lista final de alertas GPS y umbrales de velocidad.
