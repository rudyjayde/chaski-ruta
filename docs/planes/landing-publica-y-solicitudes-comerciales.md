# Landing pública y solicitudes comerciales

**Fecha de esta versión:** 8 de septiembre de 2026. Complementa al
`DOCUMENTO_MAESTRO_NEGOCIO_Y_PRODUCTO.md` §4. Hoy la landing está mayormente
escrita directo en el código y sus formularios simulan el envío con estado
local — nada de lo que describe este documento existe todavía en el
backend. `PENDIENTE DE IMPLEMENTAR` en su totalidad salvo que se indique lo
contrario.

## 1. Objetivo de la landing

- Informar sobre CHASKI AI, CHASKI RUTA y sus tres ofrecimientos.
- Mostrar soluciones y recibir requerimientos.
- Permitir que CHASKI AI prepare una propuesta personalizada.
- **No** vender ni activar automáticamente una asociación, un plan o un
  servicio GPS.

## 2. Selección inicial

Antes de las preguntas, el interesado elige una de tres soluciones:

- Operación.
- PRO.
- GPS Vehicular.

Si llega desde una tarjeta concreta de la landing, esa opción aparece
preseleccionada, pero puede cambiarla.

## 3. Formulario institucional (Operación y PRO)

Campos a solicitar:

- Asociación.
- RUC.
- Ciudad o ubicación.
- Gerente, representante o contacto, y su cargo.
- Correo y celular/WhatsApp.
- Cantidad de socios, conductores, vehículos y empresas integrantes.
- Terminales.
- Rutas repetibles con origen y destino.
- Proceso actual, problemas y requerimientos.
- Comentarios.

Si la solución elegida es **PRO**, se agrega:

- Vehículos que requieren GPS.
- Dispositivos existentes.
- Zonas operativas.
- Necesidades de monitoreo.
- Persona encargada de coordinar las instalaciones.

## 4. Formulario GPS Vehicular

Campos a solicitar:

- Socio propietario.
- DNI o RUC.
- Asociación a la que pertenece.
- Correo y celular.
- Cantidad de vehículos, con código y placa, marca y modelo de cada uno.
- Ciudad de instalación.
- GPS actualmente instalado, si tiene.
- Comentarios.

## 5. Resultado del envío

El envío del formulario:

- Crea una Solicitud comercial y la guarda en base de datos (PostgreSQL —
  la base de datos es la fuente de verdad, no el correo).
- La muestra al Super Admin dentro de la plataforma.
- Envía una notificación al correo empresarial de CHASKI AI. Si el correo
  falla, la solicitud **no se pierde** — ya quedó guardada en base de datos.

El envío **no**:

- Crea asociación, usuario ni suscripción.
- Registra pago.
- Activa PRO ni GPS.
- Calcula precio automáticamente.

## 6. De la solicitud a la asociación activa (flujo completo)

1. El interesado selecciona una solución y completa el formulario.
2. La solicitud queda registrada en el sistema y CHASKI AI recibe una
   notificación por correo.
3. El Super Admin revisa la solicitud.
4. El equipo de CHASKI AI llama o escribe al interesado.
5. Analizan rutas, vehículos, socios, conductores y necesidades reales.
6. Preparan una cotización — manualmente, fuera de la landing; ver §7.
7. Coordinan pagos, instalaciones y pruebas.
8. Recién ahí se crea y activa la asociación (o el servicio GPS individual),
   mediante el asistente interno de alta que usa el Super Admin — ver
   `DOCUMENTO_MAESTRO_NEGOCIO_Y_PRODUCTO.md` §6.2 y §14. No es un formulario
   público ni un flujo de autoservicio.

## 7. Sobre la cotización

**La landing nunca calcula ni muestra un precio.** La cotización la prepara
el equipo de CHASKI AI manualmente, después de evaluar la solicitud (paso 6
de §6), y se la comunica al cliente por fuera del sistema (llamada, correo,
reunión). El Super Admin registra esa cotización y el pago verificado como
parte del asistente interno de alta de asociación — no existe hoy una
pantalla dedicada a "cotizaciones"; se documenta como paso del proceso, no
como módulo aparte. `PENDIENTE DE DECISIÓN`: si conviene o no un registro
explícito de cotizaciones dentro del panel del Super Admin, más allá de
quedar implícito en el paso de activación.

## 8. Formulario administrable (constructor de preguntas)

El Super Admin podrá crear y modificar preguntas sin tocar código:

- Agregar preguntas nuevas, activarlas o desactivarlas, cambiar su orden,
  hacerlas obligatorias u opcionales.
- Mostrar preguntas diferentes según la solución elegida (Operación, PRO o
  GPS Vehicular).

Tipos de pregunta soportados:

- Texto corto.
- Texto largo.
- Número.
- Correo.
- Celular.
- Sí/No.
- Selección única.
- Selección múltiple.
- Fecha.
- Lista repetible (por ejemplo, rutas con origen y destino).

Cada pregunta guarda: etiqueta, texto de ayuda, tipo, obligatoriedad, orden,
estado (activa/inactiva), opciones (si aplica) y en qué soluciones aparece.

**Versionado obligatorio:** aunque una pregunta cambie o se elimine en el
futuro, cada Solicitud comercial ya enviada conserva exactamente las
preguntas y respuestas que el cliente vio y contestó en su momento — nunca
se reescribe retroactivamente.

## 9. Administrador de la landing (Super Admin)

Módulo editable sin tocar código, para:

- Empresa y contacto, redes sociales.
- Hero, beneficios, capacidades.
- Planes y características públicas de los tres ofrecimientos.
- Información de ATIPCAR como primer cliente de referencia.
- Preguntas frecuentes.
- SEO y páginas legales.
- Modo mantenimiento.
- Imágenes, CTA (llamados a la acción).
- El formulario comercial (ver §8).

Flujo de publicación obligatorio: **borrador → previsualización →
publicación**, con historial de cambios y restauración a una versión
anterior.

**Editar una tarjeta comercial pública (por ejemplo, cambiar el texto de
"Plan PRO" en la landing) nunca activa módulos reales dentro de una
asociación.** Son capas completamente separadas — contenido comercial vs.
permisos y funciones reales del sistema.

La asignación funcional exacta de características entre Operación, PRO y
GPS Vehicular sigue `PENDIENTE DE DECISIÓN` por el propietario del proyecto.
No se debe consolidar como definitivas las listas de características que
existen hoy en el código de la landing.
