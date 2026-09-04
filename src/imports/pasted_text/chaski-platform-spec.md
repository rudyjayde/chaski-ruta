Figma Make - Plataforma web multirrol CHASKI AI

## Instruccion para Figma Make

Adjunta este archivo en un proyecto Figma Make nuevo y dedicado exclusivamente a la plataforma web. Despues envia:

> Construye desde cero la plataforma web funcional descrita en el archivo adjunto. Usa el documento como unica fuente de verdad. Primero presenta un plan breve y luego implementa todos los roles, pantallas, estados e interacciones. No crees una landing, una app movil ni una demostracion dentro de un telefono.

## Objetivo

Crear un prototipo web funcional con codigo para CHASKI RUTA, producto SaaS de CHASKI AI para asociaciones y empresas de transporte.

La plataforma debe representar una operacion real de transporte por turnos, no una aplicacion tipo Uber ni un marketplace de pasajeros. La cola de la asociacion determina el orden de salida.

La primera organizacion demo es ATIPCAR y opera el corredor Juli <-> Puno mediante dos colas independientes:

- Juli -> Puno.
- Puno -> Juli.

## Alcance del archivo

Este proyecto contiene solamente la plataforma web responsive para:

1. Super Admin de CHASKI AI.
2. Administrador de una asociacion.
3. Socio o propietario.
4. Conductor web.

No incluir:

- Landing publica.
- App movil dentro de un telefono.
- Selector de roles antes del acceso.
- Pagina comercial de precios.
- Chat de inteligencia artificial.
- Datos reales de personas o credenciales productivas.

## Tecnologia del prototipo

- React.
- TypeScript.
- CSS o Tailwind con variables semanticas.
- `lucide-react` para iconos.
- Estado local y datos DEMO para todas las interacciones.
- Sin backend, base de datos, OAuth, GPS, camara ni servicios externos reales.
- Simular respuestas de servidor de forma visible y honesta.
- El prototipo debe funcionar completamente en Preview.
- TypeScript debe compilar sin errores.

## Identidad

### Acceso comun

Antes de autenticar mostrar:

- `CHASKI AI`.
- `Plataformas inteligentes para modernas operaciones`.

No mostrar `RUTIQ`, IMPORT STAR PERUVIAN EIRL ni cadenas de marcas.

### Despues del acceso

- Administrador, socio y conductor de la demo: identidad principal `ATIPCAR`.
- Super Admin: identidad principal `CHASKI AI` y banda discreta `Administracion CHASKI AI`.
- `CHASKI RUTA` es el producto, pero no se repite como subtitulo en todas las paginas.
- La asociacion activa y el rol aparecen una sola vez en la barra superior.

## Cuentas exclusivas del prototipo DEMO

Implementar exactamente estas cuentas locales:

| Panel | Usuario | Contrasena |
|---|---|---|
| Conductor ATIPCAR | `pepito@demo.atipcar.test` | `Conductor#2026` |
| Socio ATIPCAR | `socio@demo.atipcar.test` | `Socio#2026` |
| Administrador ATIPCAR | `admin@demo.atipcar.test` | `Admin#2026` |
| Super Admin CHASKI AI | `superadmin@demo.chaski.test` | `SuperAdmin#2026` |

Reglas DEMO:

- Validar usuario y contrasena exactos en el estado local.
- Credenciales incorrectas muestran `Usuario o contrasena incorrectos`.
- `Continuar con Google` abre un selector simulado con las mismas cuatro identidades.
- La cuenta determina automaticamente organizacion, rol, permisos y pagina inicial.
- No mostrar un boton para elegir rol.
- Agregar `Ver accesos DEMO` en el acceso con la advertencia `Solo prototipo. No usar en produccion`.
- No rellenar automaticamente contrasenas.
- `Cerrar sesion` elimina el contexto anterior.

## Sistema visual

### Direccion

Crear una interfaz operativa sobria, clara y profesional. Debe sentirse como software de operaciones usado muchas horas al dia.

No utilizar:

- Tema oscuro tipo Uber.
- Tipografias serif o condensadas.
- Degradados.
- Grandes espacios vacios sin funcion.
- Heroes o composicion de landing.
- Tarjetas anidadas.
- Graficos decorativos.
- Bordes excesivamente redondeados.
- Una pantalla construida solamente con tarjetas flotantes.

### Tipografia y colores

- Tipografia unica: Inter Variable.
- Fondo: `#F7F7F8`.
- Superficie: `#FFFFFF`.
- Texto principal: `#18181B`.
- Texto secundario: `#52525B`.
- Bordes: `#E4E4E7`.
- Accion principal: `#1D4ED8`.
- Hover: `#1E40AF`.
- Acento: `#F97316`.
- Direccion contraria: `#0F766E`.
- Exito: `#15803D`.
- Advertencia: `#B45309`.
- Error: `#B91C1C`.
- Radio maximo: 8 px.
- Letter spacing: 0.

### Iconografia

- Usar iconos de `lucide-react`.
- Tamano normal: 18 o 20 px.
- Los botones de icono incluyen tooltip.
- No dibujar SVG manuales cuando exista un icono Lucide.
- Usar texto junto al icono cuando la accion sea ambigua.

## Responsive y estructura

### Marcos

- Base principal: 1440 x 900 px.
- Verificar tambien 1280 x 800 px.
- Verificar tambien 1024 x 768 px.
- Adaptar a tablet sin convertir la web en una maqueta de telefono.

### Shell

- Barra lateral expandida: 248 px.
- Barra lateral colapsada: 72 px.
- Barra superior: 64 px.
- Contenido: margen 32 px desde 1280 y 24 px en 1024.
- Reticula: 12 columnas.
- Controles: 40 px de alto.
- Filas de tabla: 48 px; 56 px cuando tengan dos lineas.
- Encabezados de pagina compactos.
- Tablas, listas y bandas de estado de ancho completo.
- Tarjetas solo para indicadores concretos, elementos repetidos y modales.

### Barra superior

Mostrar:

- Asociacion o contexto global.
- Rol activo.
- Estado de sincronizacion DEMO.
- Notificaciones.
- Menu de cuenta y cerrar sesion.

Si una persona tiene varios roles aprobados, `Cambiar contexto` aparece despues del acceso en el menu de cuenta. No concede permisos nuevos.

## Acceso

La primera pantalla del proyecto es el acceso, no una landing.

Mostrar:

- CHASKI AI y su lema.
- Campo `Usuario o correo`.
- Campo `Contrasena`.
- Mostrar u ocultar contrasena.
- `Ingresar`.
- Separador `o`.
- `Continuar con Google` con la marca oficial.
- `Recuperar acceso`.
- `Ver accesos DEMO`.

Incluir estados:

- Cargando.
- Credenciales incorrectas.
- Cuenta pendiente.
- Cuenta suspendida.
- Sin permisos.
- Error de conexion.

## Datos operativos ATIPCAR

Usar datos DEMO coherentes con estas reglas:

- Asociacion: ATIPCAR.
- Aproximadamente 60 socios.
- Cinco o mas empresas integrantes.
- Empresas observadas: Virgen de Fatima, San Francisco de Borja, Sur Andino, Litoral y San Miguel.
- Ruta: Juli <-> Puno.
- Dos colas independientes.
- Inicio operacional aproximado: 04:00.
- Juli traslada su operacion al terminal alrededor de las 05:30.
- Codigos de socios: `001`, `002`, `003`, etc.
- El codigo corresponde al socio y su unidad operativa, no a la placa.
- Reemplazar un vehiculo conserva el codigo y el historial de placas.

Usar personas, DNI, telefonos, placas y manifiestos ficticios marcados DEMO.

## Panel del administrador ATIPCAR

### Pagina inicial: Centro de Operaciones

Debe ser la pantalla mas trabajada del prototipo. En la primera vista debe responder:

- Cuantos vehiculos esperan en Juli -> Puno.
- Cuantos esperan en Puno -> Juli.
- Cuales estan llamados, en terminal o embarcando.
- Cuantos viajes estan activos.
- Proximas salidas.
- Manifiestos abiertos, listos o bloqueados.
- Pasajeros y recaudacion del dia.
- Desequilibrio de flota.
- Alertas que exigen una decision.

Composicion recomendada:

1. Encabezado `Centro de Operaciones` con fecha operacional.
2. Banda principal con las dos colas lado a lado.
3. Tabla compacta `Proximas salidas`.
4. Banda `Vehiculos en ruta`.
5. Lista `Alertas y decisiones pendientes`.
6. Totales del dia en una fila compacta.

No colocar un grafico grande como protagonista.

### Navegacion del administrador

1. Inicio.
2. Operacion.
3. Colas.
4. Ventas y manifiestos.
5. Viajes.
6. Reubicaciones.
7. Unidades y flota.
8. Empresas integrantes.
9. Personas.
10. Reportes.
11. Auditoria.
12. Configuracion.

Los modulos no incluidos en el plan pueden ocultarse.

### Colas

Construir una pagina con:

- Tabs `Juli -> Puno` y `Puno -> Juli`.
- Jornada y estado de apertura.
- Busqueda por codigo o placa.
- Filtros por estado, empresa y evidencia.
- Tabla ordenada por posicion.
- Columnas: posicion, codigo, empresa, vehiculo, placa, conductor, hora, estado y evidencia.
- Panel lateral de detalle al seleccionar una fila.
- Accion `Llamar siguiente` solo cuando sea valida.
- Excepciones con confirmacion, motivo obligatorio y auditoria.
- No permitir arrastrar libremente filas.

Estados de cola:

- PREINSCRITO.
- INSCRITO.
- LLAMADO.
- EN TERMINAL.
- EMBARCANDO.
- LISTO.
- SALIO.
- AUSENTE.
- RETIRADO.

Evidencia visible:

- Registro movil.
- Presencia terminal.
- Vehiculo verificado - PRO.
- Sin evidencia suficiente.

### Kiosco QR del terminal

Dentro de Operacion crear una vista `Control terminal`:

- Selector de terminal Juli o Puno.
- QR dinamico DEMO grande.
- Cuenta regresiva aproximada de 30 segundos.
- Terminal, jornada y estado visibles.
- Lista de ultimas validaciones.
- Estado `QR vigente`, `renovando` y `sin conexion`.

El QR aporta presencia terminal, no asigna posicion y no prueba por si solo que el vehiculo esta presente.

### Ventas y manifiestos

Pagina principal:

- Tabs Borradores, Cerrados, Con incidencia y Corregidos.
- Busqueda por numero, codigo, placa o conductor.
- Filtros por fecha, empresa, ruta y estado.
- Tabla con pasajeros, capacidad, recaudacion y PDF.
- Abrir detalle en pagina o panel amplio.

El manifiesto conserva:

- Asociacion.
- Empresa integrante.
- Socio y codigo.
- Vehiculo y placa.
- Conductor del viaje.
- Usuario que digito.
- Ruta y direccion.
- Pasajeros, asientos, tarifas y pagos.
- Version, estado y huella del PDF DEMO.

Un manifiesto cerrado no se sobrescribe. Corregir crea una nueva version y exige motivo.

### Viajes

- Viajes programados, activos, completados y con incidencia.
- Origen, destino, codigo, placa, conductor, salida y llegada.
- No permitir dos viajes activos incompatibles.
- Una llegada valida cierra el viaje antes de habilitar la cola contraria.
- GPS real no se simula como verdadero; usar `Sin GPS`, `Registro movil` o `GPS PRO DEMO`.

### Reubicaciones

Representar el caso:

- Puno acumula vehiculos.
- Juli tiene demanda y pocas unidades.
- El administrador prepara una orden para los codigos 007, 008 y 009.
- Se trasladan vacios Puno -> Juli.

Flujo funcional:

1. Detectar desequilibrio.
2. Abrir propuesta.
3. Seleccionar unidades elegibles.
4. Definir motivo, ventana, orden interno y compensacion.
5. Confirmar con motivo.
6. Pasar a AUTORIZADA.
7. Simular aceptacion del conductor.
8. Mostrar EN TRASLADO y COMPLETADA.

Los vehiculos que ya esperan en Juli conservan su posicion. La compensacion no se oculta manipulando la cola.

### Unidades y flota

Jerarquia:

```text
ATIPCAR
-> Empresa integrante
-> Socio titular
-> Codigo de asociacion
-> Unidad operativa
-> Vehiculo activo
-> Historial de vehiculos
```

Pagina funcional:

- Busqueda y filtros por empresa, estado, modelo y ruta.
- Tabla de codigos, socios, empresas, vehiculos y conductores.
- Detalle con placa actual e historial.
- Accion `Reemplazar vehiculo` conserva codigo y viajes historicos.
- No usar el codigo como si fuera la placa.

### Empresas integrantes

- Lista de empresas dentro de ATIPCAR.
- Rutas autorizadas.
- Socios y unidades vinculados.
- Estado y documentos DEMO.
- Vista consolidada de ATIPCAR con filtro por empresa.

No confundir una empresa integrante con una asociacion independiente.

### Personas

Tabs:

- Conductores.
- Socios.
- Administradores.
- Invitaciones y afiliaciones pendientes.

Flujo de conductor:

1. Registrar o invitar correo.
2. Vincular identidad Google opcional.
3. Validar datos DEMO.
4. Asignar ATIPCAR, rol, unidad y vehiculo.
5. Aprobar o suspender afiliacion.
6. Consultar dispositivo operativo.

El administrador no solicita ni conserva la contrasena personal. Una clave temporal es de un solo uso y exige cambio.

### Reportes y auditoria

Reportes:

- Salidas y viajes.
- Pasajeros y recaudacion.
- Produccion por unidad y empresa.
- Ausencias e incidencias.
- Reubicaciones.

Auditoria:

- Actor.
- Organizacion.
- Accion.
- Recurso.
- Fecha y hora.
- Valores anteriores y nuevos.
- Motivo.
- Evidencia disponible.

## Web del conductor

### Navegacion

1. Inicio.
2. Cola.
3. Manifiesto.
4. Mis viajes.
5. Documentos.

### Alcance

- ATIPCAR, saludo y unidad autorizada.
- Estado actual y siguiente accion.
- Mi cola y cola de retorno en consulta.
- Registro rapido de pasajeros.
- Mapa de asientos.
- Totales por metodo de pago.
- Cierre, PDF e historial propio.

La web puede preparar ventas y manifiestos. La presencia, inscripcion sensible y llegada deben confirmarse desde el Android registrado.

### Laptop compartida

Agregar flujo `Vincular con mi app`:

1. La web muestra QR de sesion.
2. El conductor lo escanea desde su Android registrado.
3. Se abre una sesion limitada para venta y manifiesto.
4. Mostrar tiempo restante e identidad activa.
5. Expirar por tiempo, inactividad o cierre.
6. No permitir confirmar presencia o llegada desde la laptop.

## Web del socio

### Navegacion

1. Resumen.
2. Mis unidades.
3. Viajes.
4. Manifiestos.
5. Produccion.
6. Incidencias.

### Alcance

- ATIPCAR y saludo personal.
- Unidades y codigos vinculados.
- Empresa integrante.
- Vehiculo y conductor actuales.
- Estado en cola, embarcando, en ruta o disponible.
- Viajes y manifiestos autorizados.
- Produccion y recaudacion permitida.
- Incidencias y reubicaciones de sus unidades.
- GPS solo si el plan lo permite.

Interfaz principalmente de lectura. No mostrar botones administrativos que despues den error de permiso.

## Web del Super Admin

### Identidad

Usar `CHASKI AI` y la banda `Administracion CHASKI AI`. No utilizar ATIPCAR como marca principal del shell global.

### Navegacion

1. Resumen.
2. Organizaciones.
3. Implementaciones.
4. Planes y modulos.
5. Suscripciones.
6. Salud tecnica.
7. Soporte.
8. Auditoria de soporte.
9. Configuracion SaaS.

### Resumen

- Organizaciones activas, en configuracion, suspendidas o con incidencia.
- Estado de implementaciones.
- Planes y modulos activos.
- Alertas de servicio.
- Solicitudes de soporte.
- Salud tecnica resumida.

### Crear una organizacion

Implementar un asistente funcional:

1. Identidad de la asociacion.
2. Administrador inicial.
3. Plan y modulos.
4. Empresas integrantes opcionales.
5. Terminales.
6. Ruta y direcciones.
7. Horarios y reglas de cola.
8. Tarifas iniciales.
9. Revision.
10. Crear organizacion en borrador.

Una organizacion nueva aparece vacia con un checklist de configuracion; no mostrar datos ficticios como si fueran reales.

### Limites del Super Admin

- No modificar colas de clientes por defecto.
- No cerrar manifiestos.
- No reubicar vehiculos.
- No leer pasajeros completos por defecto.
- El acceso de soporte exige organizacion, motivo, vigencia y auditoria.
- `Acceso de soporte` no debe ser un boton primario gigante sin seleccionar primero una solicitud u organizacion.

## Mapas de asientos

Implementar los tres mapas en la web del conductor y en el detalle autorizado del administrador.

```text
MERCEDES BENZ SPRINTER
Capacidad fisica 21; pasajeros 20; numeracion 1-20.
[CHOFER] [      ] [      ] [ 01 ]
[ 02 ]   [ 03 ]   [ 04 ]   [PUERTA]
[ 05 ]   [ 06 ]   [PASILLO][ 07 ]
[ 08 ]   [ 09 ]   [PASILLO][ 10 ]
[ 11 ]   [ 12 ]   [PASILLO][ 13 ]
[ 14 ]   [ 15 ]   [PASILLO][ 16 ]
[ 17 ]   [ 18 ]   [ 19 ]   [ 20 ]

TOYOTA HIACE
Capacidad fisica 16; pasajeros 15; numeracion 1-15.
[CHOFER] [      ] [ 01 ] [ 02 ]
[ 03 ]   [ 04 ]   [ 05 ] [PUERTA]
[ 06 ]   [ 07 ]   [ 08 ] [      ]
[ 09 ]   [ 10 ]   [ 11 ] [      ]
[ 12 ]   [ 13 ]   [ 14 ] [ 15 ]

RENAULT MASTER
Usa exactamente la misma plantilla de Toyota Hiace.
Capacidad fisica 16; pasajeros 15; numeracion 1-15.
[CHOFER] [      ] [ 01 ] [ 02 ]
[ 03 ]   [ 04 ]   [ 05 ] [PUERTA]
[ 06 ]   [ 07 ]   [ 08 ] [      ]
[ 09 ]   [ 10 ]   [ 11 ] [      ]
[ 12 ]   [ 13 ]   [ 14 ] [ 15 ]
```

Reglas:

- Chofer, puerta, pasillo y espacios vacios no son vendibles.
- Disponible, seleccionado, ocupado y no habilitado conservan dimensiones.
- Sprinter vacia muestra `20 libres`.
- Hiace y Master vacias muestran `15 libres`.
- No existe asiento 16 de pasajeros en Hiace o Master.

## Interacciones obligatorias

El prototipo no debe ser una coleccion estatica de pantallas. Implementar:

- Inicio y cierre de sesion.
- Resolucion de las cuatro cuentas.
- Cambio y colapso de barra lateral.
- Navegacion completa por rol.
- Busqueda, filtros, tabs y seleccion de filas.
- Apertura de paneles laterales y modales.
- Llamar siguiente con confirmacion.
- Excepcion de cola con motivo.
- Ciclo de reubicacion.
- Alta o invitacion de conductor DEMO.
- Reemplazo de vehiculo conservando codigo.
- Registro de pasajero y seleccion de asiento.
- Totales por pagos.
- Cierre de manifiesto y PDF DEMO.
- Kiosco QR con cuenta regresiva simulada.
- Emparejamiento de laptop DEMO.
- Creacion de organizacion en borrador.
- Estados de carga, vacio, error, sin permiso y sin conexion.

## Accesibilidad

- Contraste WCAG AA.
- Foco visible.
- Navegacion por teclado.
- Etiquetas permanentes.
- Errores junto al campo.
- Color acompanado por texto o icono.
- Tooltips en botones solo icono.
- Tablas accesibles y encabezados semanticos.
- Texto legible sin recorte.

## Criterios de aceptacion

1. La primera pantalla es acceso web, no landing ni telefono.
2. Las cuatro cuentas DEMO abren paneles diferentes.
3. No existe selector de roles antes del acceso.
4. ATIPCAR es identidad principal para administrador, socio y conductor.
5. CHASKI AI es identidad principal para Super Admin.
6. El Centro de Operaciones muestra las dos colas y decisiones reales.
7. El administrador puede recorrer cola, manifiesto, viaje, reubicacion, flota, personas y auditoria.
8. El conductor web no confirma presencia ni llegada sin movil registrado.
9. El socio no ve ni modifica recursos de otros socios.
10. El Super Admin no opera colas ni pasajeros por defecto.
11. Una nueva organizacion empieza vacia con checklist.
12. Codigo de socio y placa nunca se confunden.
13. Reemplazar vehiculo conserva codigo e historial.
14. Reubicar no altera silenciosamente la cola de destino.
15. Los tres mapas de asientos son correctos.
16. La interfaz funciona en 1440, 1280 y 1024 px.
17. No hay texto cortado, solapamientos ni espacios vacios incoherentes.
18. Todas las acciones principales actualizan el estado local.
19. TypeScript compila sin errores.
20. Figma Make resume pantallas, componentes, estados y funciones simuladas.
