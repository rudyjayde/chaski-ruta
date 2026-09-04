PANEL WEB DEL ADMINISTRADOR DE ASOCIACIÓN — CHASKI AI / ATIPCAR

Completa y corrige exclusivamente el panel web del Administrador de ATIPCAR.
Este rol se entrega al gerente de la asociación. Solo controla su asociación:
conductores, socios, unidades, vehículos, colas, manifiestos, viajes, empresas,
reubicaciones, reportes, auditoría, configuración y GPS si tiene PRO.

No convertirlo en Super Admin. No puede ver otras asociaciones, activar su propio
plan, aprobar pagos ni crear Super Admins.

OBJETIVO DEL PROTOTIPO

Construir una DEMO navegable y funcional para validar los flujos antes de programar.
No implementar backend, OAuth, pagos, correo, GPS o documentos reales.
Toda información simulada debe mostrar “DEMO”.
Nunca mostrar GPS simulado como información real.
Todos los botones principales deben funcionar mediante datos locales de demostración.

IDENTIDAD VISUAL

Conservar el diseño administrativo actual: interfaz compacta, profesional y operativa.
Usar Lucide Icons, tablas densas, radios máximos de 8 px y estados legibles.
Evitar páginas comerciales, tarjetas anidadas y espacios vacíos excesivos.
Encabezado: “ATIPCAR · Administrador”.
Mostrar usuario “Rosa Huanca Flores”, plan actual y botón de cerrar sesión.

NAVEGACIÓN

Inicio
Operación
Colas
Ventas y manifiestos
Viajes
Reubicaciones
Unidades y flota
Empresas integrantes
Personas
Reportes
Auditoría
Configuración

Cuando PRO esté activo añadir:
GPS en vivo
Historial GPS
Dispositivos GPS
Alertas GPS

MODO DEMO

Agregar un selector claramente identificado:
“Escenario DEMO: Operación | PRO”.
Este selector solo existe en el prototipo y no aparecerá en producción.
Mantener los mismos códigos, socios, placas, conductores y viajes en todas las vistas.

INICIO — CENTRO DE OPERACIONES

Mostrar jornada, turno, estado y alertas.
Indicadores: pasajeros, recaudación, viajes activos y manifiestos abiertos.
Mostrar las dos colas independientes: Juli → Puno y Puno → Juli.
Agregar distribución completa de flota:
En Juli, en Puno, en ruta por dirección, reubicación, fuera de servicio y sin confirmar.
Mostrar próximas salidas, vehículos en ruta y decisiones pendientes.
En Operación mostrar fuente y antigüedad, nunca coordenadas físicas.
En PRO añadir mapa y posiciones “GPS PRO DEMO”.

OPERACIÓN Y COLAS

Crear un centro operativo con tabs Juli y Puno.
Mantener FIFO independiente en cada dirección.
Estados de cola: PREINSCRITO, INSCRITO, LISTO, LLAMADO, EN TERMINAL,
EMBARCANDO y SALIDO.
Permitir buscar, filtrar, llamar siguiente y registrar excepción.
Toda excepción requiere motivo, confirmación y registro de auditoría.
No permitir que una unidad esté en dos colas o viajes incompatibles.
Mostrar código, empresa, vehículo, placa, conductor, hora, evidencia y estado.

VENTAS Y MANIFIESTOS

Mostrar manifiestos borradores, cerrados, con incidencia y corregidos.
Permitir abrir detalle, registrar pasajeros DEMO, seleccionar asientos, revisar
capacidad, recaudación, documentos y cerrar manifiesto.
Las correcciones requieren motivo y conservan versión anterior y posterior.
Separar capacidad física total de pasajeros vendibles.
No permitir vender el asiento del conductor.

VIAJES

Mostrar programados, en ruta, completados y con incidencia.
Columnas: código, placa, conductor, empresa, ruta, salida programada, salida real,
llegada, fuente de ubicación y estado.
Detalle con manifiesto, pasajeros, recaudación, eventos y recorrido GPS solo en PRO.

REUBICACIONES

Mostrar desequilibrio entre Juli y Puno.
Permitir proponer, revisar, autorizar, iniciar y completar una reubicación.
No fijar S/ 15 como valor real; usar “Compensación DEMO por definir”.
Conservar el orden interno del lote y no desplazar unidades que ya esperan en destino.
Exigir motivo y confirmación.

UNIDADES Y FLOTA

Agregar botón principal “Registrar unidad”.
Columnas: código, empresa, socio titular, vehículo, placa, conductor actual,
ubicación operativa, fuente, antigüedad, GPS y estado.

Asistente “Registrar unidad”:
Paso 1: código único, empresa integrante, socio titular y fecha de alta.
Paso 2: placa, marca, modelo, año, color, capacidad física y pasajeros vendibles.
Paso 3: SOAT, tarjeta de propiedad, revisión técnica y permisos.
Paso 4: asignar conductor, invitar nuevo o continuar sin conductor.
Paso 5 PRO: registrar GPS, vincular existente o configurar después.
Paso 6: resumen y confirmación.

El código pertenece a la unidad/socio y permanece cuando cambia la placa.
No usar “Eliminar”; utilizar desactivar con motivo.
El detalle de unidad tiene tabs:
Resumen, Vehículo, Conductores, Documentos, GPS PRO e Historial.

Acciones:
Editar unidad
Asignar o cambiar conductor
Reemplazar vehículo
Actualizar documentos
Administrar GPS
Desactivar unidad

Cambiar conductor finaliza la asignación anterior y crea una nueva.
Cambiar vehículo conserva el código y el historial de placas.

PERSONAS

Tabs: Conductores, Socios, Administradores y Pendientes.
El botón cambia según el tab:
“Invitar conductor”, “Invitar socio” o “Invitar administrador auxiliar”.

Una persona tiene una sola cuenta Google o contraseña propia.
Puede tener más de un rol sin crear cuentas duplicadas.
No generar contraseñas con DNI o código.
Enmascarar DNI en tablas.

Conductor:
Datos personales, licencia, vencimiento, empresa, dispositivo Android autorizado,
unidad actual, historial y estado.
Permitir invitar, aprobar, asignar unidad, cambiar asignación y suspender afiliación.

Socio:
Datos personales, empresa, códigos/unidades, vehículos e historial.
Permitir registrar o invitar y vincular una o varias unidades.

Administrador auxiliar:
Solo el gerente con permiso puede invitarlo.
Configurar permisos limitados; nunca crear Super Admin.

EMPRESAS INTEGRANTES

Mostrar las empresas de ATIPCAR, representante, RUC, socios, unidades, rutas y estado.
Permitir ver detalle y editar información con auditoría.
Los totales deben coincidir con Unidades, Personas e Inicio.

GPS PRO

El GPS se vincula al vehículo, nunca al conductor.
Registrar proveedor, modelo Teltonika, IMEI, serie, SIM, ICCID, operador,
propiedad, instalación y estado.
Enmascarar IMEI, ICCID y teléfono en tablas.

Estados:
Sin dispositivo
Pendiente de instalación
Configurando
En prueba
En línea
Señal atrasada
Sin señal
Desvinculado
Retirado

GPS en vivo:
Mapa, filtros, código, placa, conductor, ruta, velocidad, última señal y estado.
No mover marcadores ni inventar datos cuando se pierde la señal.

Historial:
Recorrido, paradas, geocercas, pérdida de señal y viajes por fecha.

Alertas:
Desconexión, energía cortada, entrada/salida de terminal, desvío, parada prolongada
y movimiento sin viaje.
No generar sanciones automáticas; toda alerta requiere revisión.

PLAN Y SUSCRIPCIÓN

En Configuración mostrar el plan actual.
El gerente puede consultar vigencia, límites y estado de pago.
Puede pulsar “Solicitar PRO” y enviar una solicitud DEMO.
No puede aprobar el pago ni activar PRO.
La activación corresponde exclusivamente al Super Admin de CHASKI AI.

REPORTES

Filtros por fecha, ruta, empresa, código, vehículo, conductor y estado.
Reportes de viajes, manifiestos, pasajeros, recaudación, cola, reubicaciones y GPS PRO.
Mostrar resultados antes de exportar.
Simular exportación PDF y Excel con un mensaje DEMO.

AUDITORÍA

Registrar actor, rol, fecha, acción, recurso, antes, después y motivo.
Incluir llamadas de cola, excepciones, manifiestos, cambios de conductor,
reemplazos de vehículo, reubicaciones, configuración y GPS.
Permitir búsqueda y filtros. Enmascarar datos personales.

CONFIGURACIÓN

Secciones:
Organización
Terminales y horarios
Rutas
Reglas de cola
Tarifas
Tiempo tras llamado
Reglas de evidencia
Reubicaciones
Notificaciones
Administradores y permisos
Plan y módulos

Los cambios operativos sensibles requieren confirmación y motivo.

ESTADOS DE INTERFAZ

Implementar carga, vacío, error, sin permiso, documento vencido, invitación pendiente,
sin conductor, sin vehículo, sin GPS, señal atrasada y sin señal.
Agregar confirmaciones, mensajes de éxito y errores junto al campo correspondiente.
Ningún botón principal puede quedar sin respuesta.

PRUEBAS DEMO OBLIGATORIAS

1. Registrar socio, unidad, vehículo y documentos.
2. Invitar conductor y asignarlo a la unidad.
3. Cambiar conductor conservando el historial.
4. Reemplazar vehículo sin cambiar el código.
5. Llamar al siguiente en la cola.
6. Abrir y cerrar un manifiesto.
7. Registrar salida y completar viaje.
8. Crear y autorizar una reubicación.
9. Probar Operación sin coordenadas GPS.
10. Cambiar a PRO DEMO, registrar Teltonika y mostrar primera señal.
11. Simular pérdida de señal sin inventar posición.
12. Solicitar PRO sin permitir que el gerente lo active.
13. Revisar reportes y auditoría.
14. Verificar que todas las cifras coincidan entre pantallas.

ENTREGA

Dejar todas las rutas navegables y los flujos conectados.
No añadir nuevas funciones fuera de este alcance.
No presentar la DEMO como sistema productivo ni como GPS real.