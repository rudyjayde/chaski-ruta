# Instrucciones de conexión GPS — paso a paso

Complementa `plan-gps-vehicular.md`. Este documento es la guía práctica, ya
**probada en vivo** (11 sept 2026) contra el equipo real ATIPCAR-001, para
registrar cada nuevo equipo Teltonika (u otro compatible con Traccar) que se
vaya sumando a la flota. No es teoría: cada dato de esta guía fue verificado
contra el servidor Traccar real y la base de datos real de CHASKI AI, no
inventado.

Quien hace esta guía asume el rol de "técnico de software": no instala el
cable físico al vehículo, pero sí configura el equipo antes/durante la
instalación y lo vincula en las dos plataformas (Traccar y CHASKI AI).

## Referencia real usada para armar esta guía

- Equipo: Teltonika **FMC130**, firmware 04.00.00 Rev:13, configuración 12.0.0.0
- IMEI: `865124072226139`
- Nombre en Traccar: `ATIPCAR-001`
- Asociación: ATIPCAR
- Unidad/vehículo vinculado: código `001`, placa `Z0A-001`

## Paso A — Configurar el equipo con Teltonika Configurator

1. Descargar **Teltonika Configurator** (Windows) desde el sitio oficial de Teltonika.
2. Insertar la SIM en el equipo (equipo apagado).
3. Conectar el equipo a la PC por el cable USB específico de Teltonika (no un micro-USB genérico — Windows puede pedir instalar el driver la primera vez) y darle alimentación (rojo/negro a 12V) para que encienda.
4. Abrir el Configurator. En la pantalla inicial, mientras dice "Searching…", debe aparecer una tarjeta con el equipo detectado (modelo, IMEI, firmware, puerto COM). Clic sobre esa tarjeta para entrar a su configuración.
5. En la sección **GPRS** (panel izquierdo):
   - **GPRS Context:** Enable
   - **APN:** el que corresponda a la SIM instalada. Referencia real (SIM Claro): `claro.pe`, sin usuario/contraseña.
   - **GPRS Authentication:** Normal (PAP)
6. En la sección **Server Settings**:
   - **Domain:** `147.182.187.28`
   - **Port:** `80`
   - **Protocol:** TCP
   - **TLS Encryption:** None
   - **Second Server Settings:** Disabled (no se usa servidor secundario)

   Importante: **no asumir puertos "típicos" de Traccar** (por ejemplo 5027,
   el default de fábrica para Teltonika) — el servidor de CHASKI AI está
   configurado para escuchar Teltonika en el **puerto 80**. Si alguna vez se
   cambia esa configuración en el servidor, hay que volver a verificarla
   contra un equipo que ya esté funcionando antes de replicarla en uno nuevo.
7. En la sección **I/O** (panel izquierdo), habilitar (cambiar de "None" a "Low") estos 6 campos — sin esto, el equipo nunca reporta energía/ignición/kilometraje aunque el servidor ya esté listo para recibirlos:
   - **Ignition** → Low, Operand "On Change"
   - **Movement** y **Instant Movement** → Low, Operand "On Change"
   - **External Voltage** → Low, Operand "Monitoring" (energía — batería del vehículo)
   - **Battery Voltage** → Low, Operand "Monitoring" (batería interna del propio equipo)
   - **GSM Signal** → Low, Operand "Monitoring"
   - **GNSS Status** → Low, Operand "Monitoring"
   - **Total Odometer** y **Trip Odometer** → Low, Operand "Monitoring" (kilometraje)
8. Clic en **"Save to device"** para grabar toda la configuración (Server + I/O) en el equipo.
9. Cerrar el Configurator o desconectar el USB — mientras está conectado al programa, el equipo normalmente no transmite por red celular como lo haría en operación normal.

Verificado en vivo (12 sept 2026) contra ATIPCAR-001: con estos 6 campos habilitados, la posición que llega a Traccar incluye `ignition`, `motion`, `power` (voltios), `battery` (voltios), `rssi` (señal) y `totalDistance` (metros acumulados) — exactamente lo que CHASKI AI ya muestra en Admin/Socio/Conductor y usa para las alertas de corte de energía y posible remolque.

## Paso B — Registrar el dispositivo en Traccar

El equipo por sí solo no aparece en Traccar hasta que alguien lo registra
por IMEI (Traccar no acepta un IMEI repetido — si ya existe, rechaza el
registro con error 400 "Unique index or primary key violation").

1. Entrar a `http://147.182.187.28:8082` con la cuenta de administrador de Traccar.
2. Ir a **Dispositivos**.
3. Clic en **"+ Agregar"**.
4. **Nombre:** identificable, ej. `ATIPCAR-015` (asociación + código de unidad).
5. **Identificador (Unique ID):** el mismo IMEI grabado en el Paso A.
6. Guardar.

## Paso C — Vincular el IMEI en CHASKI AI

Esto ya está construido en el panel: **Super Admin → Asociaciones → (elegir
la asociación) → Detalle → pestaña "GPS"**.

1. En la tabla de unidades de esa asociación, ubicar el vehículo (por código de unidad).
2. Clic en **"Vincular"** (o "Editar" si ya tenía un IMEI distinto antes).
3. Pegar el IMEI del equipo.
4. **Guardar.**

Esto solo actualiza el campo `traccarDeviceId` de esa unidad y registra la
acción en Auditoría (`CONFIGURAR_GPS_TRACCAR`) — es un paso independiente del
registro en Traccar (Paso B): son dos sistemas separados y hay que hacer
los dos.

Si algún día se necesita desvincular (equipo dañado, cambio de unidad,
etc.), el mismo botón tiene "Desvincular" — se probó en vivo y el registro
de auditoría queda con el antes/después.

## Paso D — Verificar que funciona de punta a punta

1. Con el equipo ya instalado en el vehículo, encendido y con vista al cielo (para señal GPS) y cobertura móvil (para la SIM), esperar unos minutos.
2. En Traccar (Dispositivos), el equipo debe pasar de "unknown"/desconectado a mostrar una posición reciente.
3. En CHASKI AI, entrar al panel de GPS en vivo correspondiente (Admin, Socio o Conductor según el rol) y confirmar que la unidad muestra la posición real.

Si después de varios minutos no aparece nada en Traccar, revisar primero (en ese orden):

1. **APN incorrecto** → sin datos móviles, el equipo nunca llega a conectar.
2. **SIM sin saldo/plan de datos activo.**
3. **Domain/Port del Paso A mal escritos** (comparar letra por letra contra esta guía).
4. **IMEI mal copiado** entre el Paso A, el Paso B y el Paso C (deben ser idénticos los tres).

## Pendientes que no deben inventarse (ver también `plan-gps-vehicular.md` §9)

- Precio del equipo/instalación, garantía y plan de SIM: se definen por
  cotización real, no en este documento.
- Umbrales de alerta (velocidad, parada larga, etc.): viven en
  `gps-alerts` — no se tocan desde esta guía.
- Si el servidor Traccar cambia de IP, dominio o puerto en el futuro, **este
  documento debe actualizarse con el valor real verificado**, nunca con un
  valor supuesto.


