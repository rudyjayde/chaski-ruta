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

Si ATIPCAR sigue en Operación, el gerente puede ver que una unidad tiene "GPS particular", el estado administrativo de la vinculación y las incidencias autorizadas. **No** obtiene automáticamente el mapa ni el historial privado del socio.

## 5. Migración si ATIPCAR contrata PRO

- El dispositivo y el historial de la unidad se conservan.
- La unidad se incorpora al alcance GPS de la asociación.
- El socio mantiene la consulta de su vehículo.
- Se ajusta la facturación para evitar doble cobro por el mismo servicio y periodo.
- El acceso del conductor sigue dependiendo de su asignación vigente.

*(Nota: en el código actual esto es solo un botón de UI que cambia un texto — el cálculo real de prorrateo/fecha de corte todavía no existe. Ver `plan-pro.md` §6.)*

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
