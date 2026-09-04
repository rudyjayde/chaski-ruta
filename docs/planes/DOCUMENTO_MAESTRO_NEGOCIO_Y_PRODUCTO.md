# CHASKI AI - Documento maestro de negocio y producto

**Version:** 1.0  
**Fecha:** 30 de agosto de 2026  
**Estado:** fuente de verdad funcional para analisis, diseno y programacion  
**Primer cliente configurado:** ATIPCAR

## 1. Proposito de este documento

Este archivo explica el negocio de CHASKI AI, la propuesta publica de la landing, el producto para asociaciones de transporte y la configuracion inicial de ATIPCAR.

Claude Code debe leer este documento antes de analizar o modificar la plataforma. Cuando una pantalla, dato de prueba o documento anterior contradiga este archivo, prevalece este documento. Los precios, contratos, obligaciones legales y datos aun marcados como pendientes no deben inventarse.

## 2. Jerarquia del negocio

```text
CHASKI AI                         Empresa creadora y operadora del SaaS
└── CHASKI RUTA                   Plataforma multi-asociacion
    ├── ATIPCAR                   Primer cliente
    │   ├── Empresas integrantes
    │   ├── Socios y conductores
    │   ├── Unidades y vehiculos
    │   ├── Juli -> Puno
    │   └── Puno -> Juli
    └── Futuras asociaciones      Clientes aislados entre si
```

CHASKI AI no es una empresa de transporte, no es una asociacion y no reemplaza al gerente. Provee tecnologia, configuracion, soporte y, cuando se contrata GPS, instalacion e integracion del hardware.

## 3. Empresa CHASKI AI

### 3.1 Que hace

CHASKI AI crea plataformas digitales para asociaciones de transporte y operaciones logisticas. Su producto organiza en un mismo sistema:

- Asociaciones, empresas integrantes, rutas y terminales.
- Socios, conductores, unidades y vehiculos.
- Colas de salida por direccion.
- Registro de pasajeros, asientos y medios de pago.
- Manifiestos, viajes, llegadas y reubicaciones.
- Reportes y auditoria.
- GPS fisico y telemetria cuando corresponda al plan contratado.

La propuesta central es convertir una operacion basada en cuadernos, llamadas y decisiones verbales en un flujo compartido, trazable y verificable.

### 3.2 Problemas que resuelve

- Discusiones por el orden de salida.
- Un vehiculo anotado en lugares incompatibles o en ambas direcciones.
- Informacion duplicada o perdida entre terminales.
- Registro lento o incompleto de pasajeros y manifiestos.
- Falta de trazabilidad cuando un administrador cambia una posicion o asignacion.
- Dificultad para saber que vehiculo esta llamando pasajeros, cual sigue y cuales esperan.
- Falta de reportes confiables por unidad, socio, conductor, ruta o periodo.
- Falta de ubicacion vehicular verificable cuando el cliente necesita GPS fisico.

### 3.3 Modelo comercial

CHASKI AI opera como SaaS B2B multi-asociacion.

- El cliente principal es la asociacion, cooperativa u operador de transporte.
- El comprador habitual es el representante o gerente de la organizacion.
- Los usuarios operativos son administradores, socios y conductores.
- La asociacion paga implementacion y suscripcion segun el alcance contratado.
- GPS Vehicular puede contratarse por unidad directamente por un socio, aunque la asociacion permanezca en el plan Operacion.
- El hardware, SIM, conectividad, instalacion y soporte GPS se cotizan de forma expresa.

Los precios, permanencias, garantias y niveles de servicio deben definirse comercialmente. No deben aparecer importes inventados en la landing ni en el producto.

### 3.4 Responsabilidades de CHASKI AI

- Mantener la plataforma y el aislamiento entre asociaciones.
- Crear asociaciones y su administrador inicial.
- Configurar planes, modulos, limites, rutas y terminales autorizados.
- Verificar pagos antes de activar PRO o GPS Vehicular.
- Gestionar inventario, instalacion y soporte de dispositivos GPS.
- Mantener auditoria de acciones administrativas sensibles.
- Proteger credenciales, datos personales y documentos operativos.
- Mostrar el estado real de las integraciones; nunca simular GPS como si fuera real.

### 3.5 Identidad de marca

- **Empresa:** CHASKI AI.
- **Producto:** CHASKI RUTA.
- **Frase de marca:** `Intelligent Platforms for Modern Operations`.
- **Logo CHASKI AI:** `https://res.cloudinary.com/sgf8nwgk/image/upload/v1788027352/chaski-AI-nombre_1_1.png`
- **Logo ATIPCAR:** `https://res.cloudinary.com/sgf8nwgk/image/upload/v1788058385/ATIPCAR-LOGO-NOMBre.png`

El nombre CHASKI RUTA puede utilizarse como nombre del producto. La cuenta, contrato y soporte pertenecen a CHASKI AI.

## 4. Contenido de la landing publica

### 4.1 Objetivo

La landing debe explicar el servicio, generar solicitudes comerciales y permitir el acceso de usuarios ya autorizados. No debe presentar el panel interno como una red social ni permitir que un registro publico otorgue acceso automatico a una asociacion.

### 4.2 Navegacion

- Solucion.
- Como funciona.
- Planes.
- ATIPCAR.
- Contacto.
- Ingresar a la plataforma.

### 4.3 Hero recomendado

**Marca principal:** CHASKI AI  
**Frase:** Intelligent Platforms for Modern Operations  
**Titular comercial:** Ordenamos la operacion de asociaciones de transporte en una sola plataforma.  
**Texto de apoyo:** Centralizamos colas, pasajeros, manifiestos, viajes, flota y reportes. Cuando la operacion lo requiere, integramos GPS fisico por asociacion o por unidad.  
**Acciones:** Solicitar informacion / Ingresar a la plataforma.

El primer viewport debe mostrar el nombre CHASKI AI y una imagen real del producto. No debe usar cifras de prueba como resultados comerciales.

### 4.4 Secciones de contenido

1. **Problemas que resolvemos:** orden de salida, informacion dispersa, manifiestos manuales y poca trazabilidad.
2. **La plataforma:** una operacion conectada desde la cola hasta la llegada y la siguiente cola.
3. **Como funciona:** configuracion, alta de flota y personas, operacion diaria, manifiestos, reportes y mejora continua.
4. **Capacidades:** colas, ventas, manifiestos, viajes, reubicaciones, flota, personas, reportes, auditoria y GPS opcional.
5. **Planes:** Operacion, PRO y GPS Vehicular.
6. **Primer cliente:** ATIPCAR como primera implementacion del corredor Juli-Puno, sin presentar datos de prueba como resultados reales.
7. **Llamado comercial:** solicitar informacion o una presentacion del sistema.
8. **Acceso:** solo para usuarios previamente vinculados a una organizacion.
9. **Pie de pagina:** contacto, privacidad, terminos, cookies y Libro de Reclamaciones cuando corresponda.

### 4.5 Acceso desde la landing

1. La persona presiona `Ingresar a la plataforma`.
2. Se autentica con correo y contrasena o con Google.
3. Autenticarse no crea una afiliacion ni concede acceso operativo.
4. El backend consulta las organizaciones y roles autorizados para esa identidad.
5. Si solo tiene una asociacion, ingresa directamente.
6. Si tiene varias, aparece el Portal de asociaciones.
7. Si no tiene ninguna, se informa que debe contactar al administrador correspondiente.

Una cuenta de Google identifica a la persona, pero no la convierte automaticamente en socio, conductor o administrador.

### 4.6 Contenido prohibido

- Metricas, asociaciones, conductores, manifiestos o porcentajes de disponibilidad no verificados.
- Testimonios inventados.
- Afirmar cumplimiento legal absoluto sin revision profesional.
- Mostrar datos personales o credenciales de prueba.
- Presentar posiciones GPS simuladas como reales.
- Publicar precios no aprobados.

## 5. Producto CHASKI RUTA

### 5.1 Flujo principal

```text
Cola -> llamado de pasajeros -> registro de pasajeros y asientos
     -> cierre del manifiesto -> salida -> viaje -> llegada
     -> solicitud de ingreso a la cola contraria
```

### 5.2 Principios funcionales

- Cada asociacion es un tenant independiente.
- La configuracion de rutas, terminales y reglas pertenece a la asociacion.
- La posicion de cola la decide el servidor, no la hora del celular.
- Las acciones sensibles son auditables.
- Un vehiculo no puede estar en dos colas o viajes incompatibles.
- El GPS se vincula al vehiculo, nunca a la persona.
- Una persona puede tener varios roles en una sola cuenta.
- Ninguna integracion ausente debe simularse como disponible.

## 6. ATIPCAR como primer cliente

### 6.1 Alcance

ATIPCAR es la primera asociacion cliente configurada en CHASKI RUTA. Opera el corredor:

- Juli -> Puno.
- Puno -> Juli.

Cada direccion mantiene una cola independiente. Al completar un viaje, el vehiculo puede solicitar ingreso a la cola del terminal de llegada.

ATIPCAR puede contener varias empresas integrantes. La asociacion controla la operacion compartida; cada unidad conserva su empresa, socio propietario y conductor asignado.

### 6.2 Roles

#### Super Admin de CHASKI AI

- Crea ATIPCAR y futuras asociaciones.
- Configura el plan y sus limites.
- Verifica pagos y activa PRO o GPS Vehicular.
- Gestiona dispositivos, SIM, instalaciones e integracion tecnica.
- No opera la cola diaria ni aprueba manifiestos por defecto.

#### Administrador o gerente de ATIPCAR

- Solo ve y gestiona ATIPCAR.
- Registra vehiculos, socios, conductores y administradores auxiliares.
- Vincula personas con unidades.
- Supervisa colas, manifiestos, viajes, reubicaciones y reportes.
- Desactiva registros conservando su historial.
- Puede solicitar PRO, pero no activarlo ni aprobar pagos.

#### Socio

- Consulta sus unidades, viajes, manifiestos, produccion e incidencias.
- Puede ser propietario de una o varias unidades.
- Puede conducir su propio vehiculo con la misma cuenta y los roles SOCIO y CONDUCTOR.
- Puede contratar GPS Vehicular para una unidad aunque ATIPCAR permanezca en Operacion.

#### Conductor

- Accede con el correo autorizado durante su registro.
- Ve la empresa y la unidad que tiene asignadas, no el nombre del socio como encabezado de su inicio.
- Opera la cola, pasajeros, asientos, manifiesto, salida, viaje y llegada.
- Solo puede operar vehiculos autorizados.
- Recibe funciones GPS limitadas si su unidad asignada tiene GPS activo.

### 6.3 Alta y vinculacion de personas y vehiculos

El flujo correcto no es un boton unico para registrar socio, unidad y conductor. Son tres altas separadas y vinculadas.

#### Paso 1: registrar el vehiculo

El administrador registra como minimo:

- Codigo de asociacion o codigo de unidad.
- Placa de rodaje e historial de placas.
- Marca, modelo, clase y ano.
- Cantidad y mapa de asientos.
- SOAT y fecha de vencimiento.
- Revision tecnica y fecha de vencimiento.
- Empresa integrante y rutas habilitadas.
- Estado operativo.

Las fechas usan selector de calendario y tambien permiten digitacion validada.

#### Paso 2: registrar al socio

El administrador registra los datos personales y de acceso. Para vincular una unidad, digita el codigo de asociacion; el sistema busca el vehiculo y completa automaticamente placa, marca, modelo, empresa y estado. El administrador confirma la vinculacion.

#### Paso 3: registrar al conductor

El administrador registra nombre, DNI, correo de acceso, telefono, licencia, categoria y vencimiento. Luego busca la unidad por su codigo de asociacion y confirma la asignacion de trabajo.

El mismo correo autorizado se usa para ingresar al panel del conductor. Si la persona ya tiene una cuenta, se agrega el rol o afiliacion sin crear una cuenta duplicada.

#### Socio que tambien conduce

Se utiliza una sola persona y una sola cuenta con roles SOCIO y CONDUCTOR. La asignacion indica que conduce una de sus propias unidades. No se crea un conductor duplicado.

### 6.4 Cola operativa de ATIPCAR

La vista del gerente representa posiciones fisicas y operativas:

1. **LLAMANDO:** el vehiculo esta captando y registrando pasajeros.
2. **RAMPA 1:** siguiente vehiculo preparado para avanzar.
3. **RAMPA 2:** segundo vehiculo en espera dentro del terminal.
4. **EXTERIOR 1:** primer vehiculo esperando fuera.
5. **EXTERIOR 2:** segundo vehiculo esperando fuera.
6. **COLA 1, COLA 2, ...:** unidades restantes en orden FIFO.

Los nombres internos de estados pueden ser mas detallados, pero el administrador de ATIPCAR debe ver estas posiciones operativas. Juli -> Puno y Puno -> Juli se muestran por separado.

Cuando el vehiculo que esta LLAMANDO cierra su manifiesto y confirma salida:

1. Sale de la cola mediante una transaccion valida.
2. RAMPA 1 pasa a LLAMANDO.
3. RAMPA 2 pasa a RAMPA 1.
4. EXTERIOR 1 pasa a RAMPA 2.
5. EXTERIOR 2 pasa a EXTERIOR 1.
6. La primera unidad restante pasa a EXTERIOR 2.

Los cambios manuales requieren usuario, fecha, motivo y valores anterior/nuevo. No se permite reordenar silenciosamente.

### 6.5 Venta y manifiesto

- La capacidad y el mapa de asientos proceden del vehiculo.
- Cada pasajero ocupa un asiento disponible.
- Se registra DNI, nombre, origen, destino, tarifa y medio de pago.
- El medio de pago sirve para liquidacion y reportes: efectivo, Yape o Plin.
- El QR de pago se configura y guarda en el perfil del conductor; mostrar el QR es una accion separada.
- El manifiesto permanece en borrador mientras se registran pasajeros.
- Al cerrar, se genera una version inmutable y un PDF.
- El PDF incluye logos, numero, emision, ruta, vehiculo, conductor, pasajeros, asientos, importes, cierre, salida, llegada y descarga cuando cada dato exista.
- El QR del manifiesto abre una pagina publica de verificacion, confirma su autenticidad y permite visualizar el PDF valido.

### 6.6 Reubicaciones

Si un terminal acumula unidades y el otro tiene demanda, el administrador ve ambas colas y elige manualmente los codigos de las unidades a reubicar, enviandolas vacias desde la terminal con mayor acumulacion. No hay flujo de propuesta y aceptacion por unidad -- es una decision directa del administrador.

**Correccion (4 de septiembre de 2026):** las unidades reubicadas se saltan el tiempo minimo de espera antes de re-inscribirse (plan-operacion.md §3.4). Su orden en destino respeta el orden con que el administrador las marco al ordenar la reubicacion, pero ajustado a su llegada real confirmada por GPS -- no es el "orden elegido" fijo de antemano, sino ese orden validado contra cuando llego cada unidad de verdad. Nunca altera a quienes ya esperaban en el destino antes de la reubicacion. La compensacion economica permanece por definir; no se debe fijar automaticamente un importe.

## 7. Planes y alcances comerciales

La arquitectura comercial tiene tres alcances relacionados:

1. **Operacion:** plan base de la asociacion.
2. **PRO:** ampliacion para toda la asociacion.
3. **GPS Vehicular:** complemento por unidad que puede comprar un socio.

### 7.1 Plan Operacion

Es el plan base para digitalizar y controlar la operacion sin GPS fisico continuo.

Incluye:

- Organizacion y empresas integrantes.
- Administrador, socios, conductores y cuentas por rol.
- Registro y vinculacion de vehiculos.
- Rutas, sentidos y terminales.
- Colas digitales por direccion.
- Posiciones LLAMANDO, RAMPA y EXTERIOR para ATIPCAR.
- Registro de pasajeros, mapa de asientos y medios de pago.
- Manifiesto, cierre, PDF y QR publico de verificacion.
- Salida, viaje, llegada y retorno a la cola contraria.
- Reubicaciones autorizadas.
- Reportes operativos y auditoria basica.
- Soporte segun el contrato.

No incluye ubicacion GPS fisica continua. Puede utilizar evidencia de cuenta, dispositivo o terminal, pero nunca debe mostrar coordenadas como si provinieran de un rastreador.

### 7.2 Plan PRO para la asociacion

PRO se activa para toda la asociacion despues de una solicitud, cotizacion, pago verificado y configuracion del Super Admin.

Incluye todo Operacion, mas:

- GPS fisico para las unidades incluidas en el contrato.
- Mapa de flota en vivo.
- Ultima posicion valida y estado de senal.
- Historial de recorridos, paradas y kilometraje.
- Geocercas de terminales y zonas operativas.
- Alertas de desconexion, energia, ignicion, velocidad y entrada/salida de geocerca segun configuracion.
- Estado tecnico de dispositivos y SIM.
- Reportes avanzados de flota y recorridos.
- Herramientas de supervision para el gerente.
- Soporte GPS y mantenimiento segun contrato.

El administrador puede `Solicitar PRO`, pero solo el Super Admin de CHASKI AI puede verificar el pago, asignar dispositivos y activar el alcance.

PRO no genera sanciones automaticas basadas unicamente en GPS. Una alerta es evidencia para revision, no una condena automatica.

#### 7.2.1 La cola en unidades PRO: el hardware reemplaza al celular, nunca a la decision del conductor

Las verificaciones de llegada del plan Operacion (vinculo cuenta-dispositivo, chequeo puntual de GPS del celular, tiempo minimo de viaje, cadena de predecesores) existen como sustituto de una fuente de verdad fisica que Operacion no tiene. Una unidad con GPS fisico activo bajo PRO ya no depende de esas senales indirectas: el servidor conoce la posicion real del vehiculo en todo momento.

**Correccion (4 de septiembre de 2026):** se descarta la inscripcion 100% automatica por geocerca. El hardware reemplaza al GPS del celular como fuente de verdad de ubicacion, pero el conductor sigue siendo quien decide presionar "Inscribirme" o "No saldre ahora" -- igual que en Operacion. Entrar a la geocerca de la terminal no inscribe solo al vehiculo.

Para las unidades con GPS fisico activo:

- Al presionar "Inscribirme", la condicion de GPS de terminal se valida con la posicion real del vehiculo leida de Traccar en vez de con el celular -- el resto del flujo (los 60 minutos, la cadena de predecesores) es identico a Operacion.
- Como el dispositivo se vincula por IMEI al vehiculo y nunca a una cuenta o conductor (§7.3), esa validacion deja de depender de que cuenta este activa. Esto cierra de forma estructural el vector de fraude por cuentas o dispositivos compartidos que motivo el diseno de verificacion de Operacion: ninguna cuenta puede sustituir la presencia fisica real del vehiculo.
- La regla dura de secuencia ("no puede entrar a la cola contraria mientras el viaje anterior sigue abierto") se mantiene sin cambios y es independiente del plan; con PRO se verifica con datos de posicion reales en vez de con un proxy de tiempo minimo.
- Los riesgos que subsisten no son de cuentas sino de hardware: perdida de senal (§8.4), y en teoria el traslado fisico del dispositivo entre vehiculos, mitigado por el registro de IMEI, fotos y responsable en la instalacion (§8.2) y por deteccion de patrones de telemetria anomalos.
- Las herramientas manuales de excepcion (boton de alerta, intervencion del gerente) se mantienen igual que en Operacion para incidentes reales; el GPS fisico no las reemplaza.

Esta seccion describe el diseno tecnico del diferenciador de cola en PRO. El comportamiento ante perdida de senal al inscribirse sigue abierto y se lista en §13.

### 7.3 GPS Vehicular por unidad

GPS Vehicular permite que un socio controle una o varias unidades propias aunque ATIPCAR permanezca en Operacion.

Incluye para cada unidad contratada:

- Equipo Teltonika compatible instalado y configurado; el modelo recomendado es FMC130, sujeto a validacion tecnica.
- SIM, conectividad y plataforma segun cotizacion.
- Vinculacion por IMEI al vehiculo, nunca al conductor.
- Ubicacion actual o ultima posicion valida.
- Estado de senal, energia e ignicion.
- Historial de recorridos, paradas y kilometros.
- Alertas configuradas para el propietario.
- Reportes por unidad y periodo.
- Historial de conductores asignados.
- Recordatorios de mantenimiento cuando se implementen.
- Soporte del dispositivo y la conectividad segun contrato.

#### Beneficio para el conductor asignado

Mientras su asignacion al vehiculo este activa, el conductor recibe acceso limitado a:

- Estado GPS de la unidad actual.
- Mapa y ultima posicion valida relacionada con su operacion.
- Recorrido de sus propios turnos o viajes.
- Avisos de llegada/salida de terminal cuando correspondan.
- Reporte de falla GPS, desconexion o emergencia.

El conductor no puede:

- Ver la facturacion del socio.
- Configurar geocercas globales.
- Ver recorridos de otros conductores o anteriores a su asignacion.
- Cambiar IMEI, SIM, dispositivo o contrato.
- Consultar otras unidades del socio si no las tiene asignadas.

Cuando termina la asignacion, el conductor pierde ese acceso. El nuevo conductor lo recibe automaticamente al ser vinculado.

#### Visibilidad del administrador sin PRO

Si ATIPCAR sigue en Operacion, el gerente puede ver que una unidad tiene `GPS particular`, el estado administrativo de la vinculacion y las incidencias autorizadas. No obtiene automaticamente el mapa ni el historial privado del socio.

#### Migracion si ATIPCAR contrata PRO

- El dispositivo y el historial de la unidad se conservan.
- La unidad se incorpora al alcance GPS de la asociacion.
- El socio mantiene la consulta de su vehiculo.
- Se ajusta la facturacion para evitar doble cobro por el mismo servicio y periodo.
- El acceso del conductor sigue dependiendo de su asignacion vigente.

### 7.4 Comparacion resumida

| Capacidad | Operacion | PRO asociacion | GPS Vehicular |
|---|---:|---:|---:|
| Cola digital y manifiestos | Si | Si | Usa el plan de la asociacion |
| Viajes y reportes operativos | Si | Si | Consulta de la unidad |
| GPS fisico | No | Flota contratada | Unidad contratada |
| Mapa en vivo | No | Gerente y permisos definidos | Socio y conductor limitado |
| Historial GPS | No | Flota contratada | Unidad contratada |
| Geocercas y alertas | No | Asociacion | Propietario, segun alcance |
| Titular del contrato | Asociacion | Asociacion | Socio por unidad |
| Activacion | Super Admin | Super Admin | Super Admin tras instalacion |

## 8. Flujo comercial y tecnico del GPS

### 8.1 Solicitud y pago

1. La asociacion solicita PRO o el socio cotiza GPS Vehicular.
2. CHASKI AI define equipos, unidades, instalacion, SIM, conectividad y precio.
3. El cliente paga por el canal aprobado, incluso transferencia bancaria si se acuerda.
4. El Super Admin registra y verifica el pago.
5. El pago verificado crea una orden de instalacion; no activa por si solo una posicion GPS.

### 8.2 Instalacion

1. CHASKI AI asigna un dispositivo de inventario.
2. Un tecnico instala el Teltonika en el vehiculo.
3. Se registran IMEI, SIM, APN, servidor, vehiculo, fotos y responsable.
4. Se configura el envio de telemetria hacia Traccar.
5. Se comprueba ubicacion, ignicion, energia y frecuencia de reporte.
6. Se vincula el dispositivo a la unidad en CHASKI RUTA.
7. Se activa el derecho de acceso correspondiente.

El socio no debe configurar el hardware por su cuenta salvo que CHASKI AI apruebe un procedimiento asistido.

### 8.3 Arquitectura funcional

```text
Teltonika FMC130 -> red movil/SIM -> servidor Traccar
                  -> backend CHASKI AI -> permisos y reglas
                  -> web/app del socio, conductor o administrador
```

Traccar recibe y normaliza la telemetria. CHASKI AI conserva la identidad, el contrato, la relacion vehiculo-persona, los permisos, las alertas de negocio y la experiencia de usuario.

### 8.4 Perdida de senal

- Mostrar `Sin senal`.
- Mostrar fecha y hora de la ultima posicion valida.
- No mover el marcador artificialmente.
- No afirmar que el vehiculo sigue en ese punto.
- Registrar reconexion cuando vuelva la telemetria.

## 9. Como se soluciona el problema de las colas

### Antes

- El orden depende de cuadernos, llamadas o memoria.
- Los dos terminales pueden tener informacion distinta.
- No siempre se sabe quien esta llamando pasajeros o quien sigue.
- Los cambios pueden producir discusiones porque no queda evidencia.
- Un vehiculo puede intentar anotarse antes de cerrar el viaje anterior.

### Con CHASKI RUTA

- Cada sentido tiene una cola unica en el servidor.
- La inscripcion es idempotente: repetir una solicitud no duplica la entrada.
- La posicion se asigna en una transaccion atomica.
- El panel muestra LLAMANDO, RAMPA 1, RAMPA 2, EXTERIOR 1 y EXTERIOR 2.
- El conductor y el gerente consultan el mismo orden confirmado.
- Un vehiculo con viaje activo no puede entrar en una cola incompatible.
- La salida desplaza las posiciones en una sola operacion.
- Toda excepcion registra actor, fecha, motivo y cambio.
- Al llegar al destino, primero se cierra el viaje y despues se solicita la cola contraria.

La tecnologia no inventa la politica de sanciones. ATIPCAR debe aprobar tiempos de tolerancia, ausencias y excepciones antes de automatizarlos.

## 10. Reglas de seguridad y consistencia

- Toda consulta y mutacion debe filtrar por `organization_id` en el backend.
- El frontend oculto no reemplaza la autorizacion del servidor.
- Una persona tiene una sola identidad y puede tener varias afiliaciones o roles.
- Nunca se generan contrasenas a partir del DNI, codigo de unidad o telefono.
- Las invitaciones expiran y su aceptacion debe ser verificable.
- Los datos personales sensibles se enmascaran segun el rol.
- Los manifiestos cerrados son inmutables; una correccion crea version y auditoria.
- Un vehiculo tiene un propietario vigente y puede tener asignaciones historicas de conductores.
- La asignacion de conductor tiene inicio, fin, estado y usuario que la autorizo.
- El GPS pertenece al vehiculo y su acceso se deriva del contrato y la asignacion vigente.
- Los totales de Inicio, Unidades, Empresas y Personas deben provenir de la misma fuente.

## 11. Rutas funcionales esperadas

- `/` - landing publica de CHASKI AI.
- `/ingresar` - autenticacion.
- `/portal` - asociaciones disponibles para la cuenta autenticada.
- `/app` - panel correspondiente a organizacion y rol.
- `/verificar/manifiesto/:token` - verificacion publica del manifiesto.

El enrutamiento puede cambiar por decision tecnica, pero debe conservar estas responsabilidades y controles de acceso.

## 12. Criterios de aceptacion para Claude Code

Antes de considerar implementado el negocio, verificar:

- La landing diferencia CHASKI AI, CHASKI RUTA y ATIPCAR.
- No aparecen metricas no verificadas ni credenciales de prueba.
- Google no concede acceso sin afiliacion aprobada.
- El Super Admin activa planes; el gerente solo los solicita.
- Operacion funciona sin GPS fisico.
- PRO habilita GPS para la flota contratada de la asociacion.
- GPS Vehicular puede activarse para una unidad sin cambiar el plan de ATIPCAR.
- El conductor hereda solo funciones GPS limitadas mientras tenga la unidad asignada.
- El vehiculo se registra antes de vincular socio y conductor.
- Socio-conductor utiliza una sola cuenta.
- Las colas Juli -> Puno y Puno -> Juli son independientes y consistentes.
- La vista ATIPCAR usa LLAMANDO, RAMPA 1, RAMPA 2, EXTERIOR 1 y EXTERIOR 2.
- Cerrar el manifiesto, salir, llegar e ingresar a la cola contraria respeta el orden.
- El QR publico verifica un manifiesto real y muestra su PDF autorizado.
- La perdida de senal GPS no crea una posicion falsa.
- La migracion de GPS Vehicular a PRO conserva historial y evita doble cobro.

## 13. Pendientes que no deben inventarse

- Precios definitivos de Operacion, PRO y GPS Vehicular.
- Duracion minima, garantia, SLA y politica de reposicion del hardware.
- Proveedor, costo y limites del plan de datos SIM.
- Politica aprobada de ausencia y tolerancia en colas.
- Formula de compensacion por reubicaciones.
- Lista final de alertas GPS y umbrales de velocidad.
- Alcance exacto de Google Maps y costos de API.
- Textos legales finales revisados por un profesional.
- Fecha y condiciones para venta publica de pasajes; no forma parte del alcance operativo inicial.
- Comportamiento de una unidad PRO ante perdida de senal GPS en el momento de inscribirse en cola: si cae al mecanismo de respaldo de Operacion (chequeo por celular) o si queda marcada "Sin senal" para intervencion manual del gerente (ver §7.2.1).

## 14. Entregable HTML relacionado

La landing estatica preparada para revision se encuentra en:

`CHASKI_AI_DOCUMENTACION/landing-chaski-ai.html`

Es una referencia visual y de contenido. Antes de produccion debe conectarse al sistema real de autenticacion, formularios, consentimiento, analitica aprobada y backend comercial.

## 15. Prompt recomendado para Claude Code

```text
Lee primero CHASKI_AI_DOCUMENTACION/DOCUMENTO_MAESTRO_NEGOCIO_Y_PRODUCTO.md y toma ese archivo como fuente de verdad funcional. Luego revisa CHASKI_AI_DOCUMENTACION/landing-chaski-ai.html y el codigo existente del proyecto.

Todavia no programes ni cambies datos. Entrega un analisis con:
1. Que partes del negocio ya estan representadas en el codigo.
2. Que funcionalidades faltan para Operacion, PRO y GPS Vehicular.
3. Contradicciones entre el codigo y el documento maestro.
4. Riesgos de autenticacion, roles, aislamiento por organizacion, cola, manifiestos y GPS.
5. Modelo de datos y endpoints que harian falta, sin inventar precios ni reglas pendientes.
6. Plan de implementacion por fases, comenzando por identidad, autorizacion multi-tenant y consistencia de cola.

Marca cada conclusion como OBSERVADO EN CODIGO, DEMOSTRADO POR PRUEBA o NO VERIFICADO. No consideres funcional un flujo solo porque exista una pantalla.
```
