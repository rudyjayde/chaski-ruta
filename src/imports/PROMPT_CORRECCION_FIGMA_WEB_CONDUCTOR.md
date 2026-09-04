# Correccion Figma Make - Web del conductor

## Prompt para el proyecto web existente

Corrige exclusivamente la experiencia web del conductor descrita aqui. Conserva la landing, el login, la identidad, las cuentas DEMO y los paneles de Socio, Administrador y Super Admin. No reconstruyas ni reduzcas las otras experiencias.

## Problema actual

El conductor solo ve listas y mensajes pasivos. No puede comprender como continuar la inscripcion desde la app, `Mis viajes` no permite administrar sus vueltas y `Documentos` mezcla credenciales personales con documentos del vehiculo.

Tambien existe una incoherencia: Jose aparece `En ruta` mientras su manifiesto sigue abierto con 12/20 pasajeros. Los estados incompatibles no deben coexistir.

## Navegacion

Usar:

1. `Inicio`.
2. `Cola`.
3. `Manifiesto`.
4. `Mis viajes`.
5. `Mi perfil`.

Mantener ATIPCAR como identidad principal. Eliminar el texto repetido `CHASKI RUTA` del pie del sidebar del panel autenticado.

## Inicio: tablero de jornada

El inicio debe responder que esta haciendo Jose y cual es su siguiente accion.

Mostrar:

- `Hola, Jose`.
- `ATIPCAR - Codigo 015`.
- Unidad asignada, placa y capacidad vendible.
- Estado actual, terminal y direccion.
- Accion principal dependiente del estado.
- Posicion y vehiculos por delante cuando corresponda.
- Manifiesto actual cuando este habilitado.
- Viaje activo cuando corresponda.
- Resumen de hoy: vueltas completadas, pasajeros y recaudacion bruta.

Implementar estos estados locales navegables:

- `DISPONIBLE_EN_JULI`: boton `Inscribirme en Juli -> Puno`.
- `PREINSCRITO`: boton `Confirmar presencia desde mi app`.
- `EN_COLA`: posicion, vehiculos por delante y `Preparar manifiesto`.
- `LLAMADO`: `Completar manifiesto`.
- `EMBARCANDO`: `Cerrar manifiesto`.
- `EN_RUTA`: manifiesto cerrado, pasajeros, recaudacion y `Registrar llegada desde mi app`.
- `LLEGADA_CONFIRMADA_EN_PUNO`: `Inscribirme en Puno -> Juli`.

En modo DEMO agrega un control discreto dentro del indicador `Demo` para cambiar o reiniciar el escenario. No mostrarlo como funcionalidad productiva.

## Cola e inscripcion

Redisenar la pantalla para aprovechar el ancho completo.

- Encabezado con estado propio, ruta elegible y ultima confirmacion.
- Lista Juli -> Puno y lista Puno -> Juli.
- Resaltar `Tu unidad - Codigo 015`.
- Columnas: posicion, codigo, estado y hora.
- Mostrar cuantos vehiculos estan por delante.
- La cola contraria es solo lectura mientras exista viaje activo.
- Mostrar una accion clara cuando Jose no esta inscrito.

Flujo al pulsar `Inscribirme` desde la web:

1. Validacion DEMO de cuenta activa, unidad autorizada, documentos vigentes y ausencia de viaje incompatible.
2. Modal `Continua en tu app`.
3. QR de un solo uso con cuenta regresiva.
4. Pasos visibles: dispositivo registrado, ubicacion permitida, QR dinamico y confirmacion del servidor.
5. Boton exclusivo de prototipo `Simular confirmacion desde la app`.
6. Al confirmar, asignar posicion y actualizar Inicio y Cola.
7. Ante un fallo, mostrar motivo concreto y no inscribir.

La web no confirma por si sola presencia, inscripcion definitiva ni llegada. No dejar solamente un aviso naranja sin boton ni siguiente paso.

## Mis viajes

Agregar filtros funcionales:

- Periodo: `Hoy`, `Ultimos 7 dias`, `Este mes` y `Personalizado`.
- Rango fecha desde/hasta para personalizado.
- Ruta: `Todas`, `Juli -> Puno` y `Puno -> Juli`.
- Estado: todos, activo, completado, cancelado y con incidencia.

Agregar un mini reporte que se recalcula con los filtros:

- Vueltas completadas.
- Pasajeros transportados.
- Efectivo.
- Yape.
- Plin.
- Recaudacion bruta total.

Debajo usar una tabla de ancho completo con fecha, ruta, salida, llegada, pasajeros, efectivo, Yape, Plin, total, estado, manifiesto y acciones. Incluir varias filas DEMO coherentes en ambos sentidos y un boton `Descargar reporte` con PDF y CSV simulados.

No llamar ganancia o utilidad a la recaudacion bruta.

## Mi perfil y documentos

Reemplazar `Documentos` por `Mi perfil` con cuatro tabs:

### Informacion personal

- Nombres y apellidos.
- DNI.
- Telefono.
- Correo.
- Direccion.
- Asociacion ATIPCAR.
- Codigo 015.
- Estado de afiliacion.

### Credenciales

- Licencia de conducir.
- Categoria.
- Numero.
- Fecha de emision.
- Fecha de vencimiento.
- Certificado medico.

No crear dos elementos separados llamados `Licencia` y `Brevete`.

### Unidad asignada

- Codigo.
- Placa.
- Modelo.
- Capacidad vendible.
- Empresa integrante.

### Documentos de unidad

- SOAT.
- Tarjeta de identificacion vehicular.
- Revision tecnica.
- Permisos configurados.

Cada documento muestra `Vigente`, `Por vencer`, `Vencido` o `Pendiente de revision`, fecha de vencimiento y acciones autorizadas `Ver`, `Descargar` y `Solicitar actualizacion`.

Usa datos ficticios marcados DEMO. No conectes almacenamiento ni subas archivos reales.

## Diseno y verificacion

- Mantener Inter Variable, tema claro y `lucide-react`.
- Evitar grandes espacios vacios, tarjetas anidadas y paneles estrechos pegados a la izquierda.
- Usar tablas y bandas de estado de ancho completo.
- Conservar radio maximo de 8 px.
- Verificar 1440, 1280 y 1024 px.
- Todas las acciones modifican estado local y funcionan en Preview.
- TypeScript debe compilar sin errores.

Antes de editar, presenta un plan breve limitado a estas pantallas. Al finalizar enumera estados, filtros e interacciones implementadas.
