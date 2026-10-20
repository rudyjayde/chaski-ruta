# Mockups de la aplicación nativa (Flutter) — paquete para generar con ChatGPT

**Fecha:** 20 de octubre de 2026. Complementa a `plataformas-web-y-app-nativa.md`.
Ante cualquier duda de negocio manda `DOCUMENTO_MAESTRO_NEGOCIO_Y_PRODUCTO.md`.

**Estado:** `DISEÑO EN PREPARACIÓN`. Este documento sirve para producir los
mockups. **No autoriza a programar la app** — antes de escribir código siguen
pendientes las decisiones de §8.

---

## 0. Cómo usar este paquete con ChatGPT

1. Abre un chat nuevo y pega **completo** el bloque de §1 (brief maestro).
   ChatGPT debe responder "Entendido" y nada más.
2. Pega **un prompt de pantalla a la vez** (§3, §4, §5), en el orden del
   documento. Empieza por el Conductor, que es el canal principal.
3. Pide cada pantalla en **dos tamaños**: Android 412×915 y iPhone 390×844.
   Si una pantalla tiene varios estados, pide **un lienzo por estado** y
   ponlos lado a lado en una misma imagen.
4. Revisa cada resultado con la lista de §7 antes de pasar a la siguiente. Si
   algo rompe una regla, responde: "Corrige: [regla de §7 que rompe]".
5. Cuando termines un rol, pide: "Muestra todas las pantallas del Conductor
   en una sola imagen tipo mapa de flujo, con flechas entre ellas".

Consejo: si ChatGPT empieza a olvidar la marca o las reglas (pasa en chats
largos), vuelve a pegar el brief de §1 y sigue.

---

## 1. Brief maestro (pegar primero, una sola vez)

```text
Vas a diseñar los mockups de alta fidelidad de una aplicación móvil nativa
(Android e iOS, se construirá en Flutter) llamada CHASKI RUTA, de la empresa
CHASKI AI. Te voy a pedir pantallas una por una. Antes de cada respuesta,
cumple TODO lo de este brief. Responde ahora solo "Entendido".

QUÉ ES
CHASKI RUTA ordena las colas de salida de vehículos de transporte
interprovincial en Perú (minivans de unos 20 asientos). Cada asociación de
transportistas opera exactamente DOS rutas: una de IDA y una de RETORNO,
entre dos terminales. En cada terminal hay una cola digital. El vehículo
que está primero está "LLAMANDO": capta pasajeros, llena su manifiesto
(lista oficial de pasajeros) y sale. Al llegar al otro terminal se inscribe
en la cola de regreso.

USUARIOS DE LA APP (tres roles, una sola app, la persona entra con su cuenta)
- CONDUCTOR: el usuario principal. Usa la app en el terminal, de pie, al sol,
  con un Android de gama media, muchas veces con una mano.
- SOCIO: dueño de una o varias unidades. Consulta, no opera.
- ADMINISTRADOR de la asociación: usa la app solo para responder rápido a
  excepciones. La administración completa la hace en la web.
No existe rol Super Admin en la app.

IDENTIDAD VISUAL (obligatoria)
- Tipografía: Inter. Títulos 20-22 semibold, cuerpo 15-16 regular,
  etiquetas 13 medium. Nada menor a 13.
- Colores:
  primario #1D4ED8 (hover/presionado #1E40AF)
  acento #F97316 (solo para llamar la atención, con moderación)
  teal #0F766E
  éxito #15803D, advertencia #B45309, peligro #B91C1C
  fondo #F7F7F8, superficie #FFFFFF, borde #E4E4E7
  texto principal #18181B, texto secundario #52525B, apagado #71717A
- Modo oscuro: fondo #18181B, superficie #202023, borde #303034,
  texto #F4F4F5, secundario #A1A1AA.
- Estados de cola (chips/etiquetas):
  LLAMANDO = cian (fondo #CFFAFE, texto #0E7490), el más llamativo.
  EN COLA 2, EN COLA 3... = azul primario al 10% con texto primario.
  SALIÓ = verde éxito. AUSENTE = rojo peligro. RETIRADO = gris.
- Iconos de línea estilo Lucide, trazo 2 px.
- Esquinas 12 px en tarjetas, 10 px en botones. Sombras muy suaves.
- Estética sobria, profesional, de herramienta de trabajo. No infantil, sin
  ilustraciones decorativas, sin degradados llamativos, sin emojis.
- El logo de CHASKI RUTA va solo en splash y login. Dentro de la app, la
  cabecera muestra el nombre y logo de la ASOCIACIÓN del usuario (usa un
  logo genérico de placeholder).

USABILIDAD (obligatoria)
- Áreas táctiles de mínimo 48×48 dp. Botón principal de 56 dp de alto.
- Alto contraste para luz solar. Texto nunca gris claro sobre blanco.
- Una sola acción principal por pantalla, grande y abajo, al alcance del
  pulgar. Acciones secundarias como botón de contorno o texto.
- Navegación inferior de máximo 5 pestañas.
- Formularios cortos, teclado numérico para DNI, montos y asientos.
- Cada pantalla contempla sus estados: cargando (skeleton), vacío, error,
  y sin conexión (franja superior "Sin conexión — mostrando datos de las
  HH:MM").
- Idioma: español de Perú. Moneda: S/ con dos decimales.

REGLAS DE NEGOCIO QUE EL DISEÑO NO PUEDE ROMPER
1. Nunca escribas nombres de ciudades reales. Las rutas se muestran como
   "Ciudad A → Ciudad B" (ida) y "Ciudad B → Ciudad A" (retorno). Los
   terminales: "Terminal Ciudad A" y "Terminal Ciudad B".
2. El contador de 60 minutos después de salir NO es una hora de llegada.
   Nunca escribas "llegada estimada", "ETA" ni "llegas en". Su texto es:
   "Inscripción de retorno disponible en 42:15".
3. LLAMANDO no vence por tiempo. No dibujes cronómetros ni "tiempo
   restante" sobre LLAMANDO.
4. El manifiesto solo se llena estando LLAMANDO y con el vehículo detenido.
   Nunca diseñes el manifiesto como algo que se usa en movimiento.
5. No existe un botón "Marcar llegada". Al llegar, el conductor presiona
   "Inscribirme" y el sistema valida todo en ese momento.
6. Posiciones: la primera siempre es LLAMANDO; las siguientes son EN COLA 2,
   EN COLA 3... Nunca existe "EN COLA 1".
7. Plan Operación (sin GPS en el vehículo): nunca muestres mapas de flota,
   coordenadas ni recorridos. El mapa solo aparece donde el prompt lo diga
   explícitamente (unidades con GPS).
8. Si una unidad con GPS pierde señal: muestra "Sin señal" y la hora de la
   última posición válida. Nunca un marcador "en vivo".
9. Datos de pasajero: "Nombres" y "Apellidos" en campos separados. Tipo de
   documento: DNI (8 dígitos), Carné de extranjería o Pasaporte.
10. Medios de pago: Efectivo, Yape, Plin.
11. Datos de ejemplo siempre ficticios: nombres inventados, placas tipo
    "ABC-123", unidades con código de 3 dígitos ("003", "014"), empresas
    "Empresa de Transportes Ejemplo S.A.C.".

FORMATO DE ENTREGA
Mockup de alta fidelidad, plano (sin mano ni teléfono físico alrededor),
con barra de estado del sistema. Si te pido varios estados, ponlos lado a
lado con un título corto encima de cada uno.
```

---

## 2. Pantallas comunes (los tres roles)

### 2.1 Splash y login

```text
Pantalla: Splash + Login (dos lienzos lado a lado).
Splash: fondo primario #1D4ED8, logo "CHASKI RUTA" en blanco centrado,
debajo en pequeño "por CHASKI AI".
Login: fondo claro. Arriba logo CHASKI RUTA. Título "Ingresa a tu
asociación". Botón grande "Continuar con Google" (blanco con borde y logo
de Google). Separador "o". Campos "Correo" y "Contraseña" (con mostrar/
ocultar). Botón principal "Ingresar". Enlace "¿Olvidaste tu contraseña?".
Abajo, texto pequeño: "Solo pueden ingresar cuentas registradas por su
asociación." No hay botón "Crear cuenta": las cuentas las crea la
asociación.
```

### 2.2 Elegir asociación o rol

```text
Pantalla: "¿Con qué quieres entrar?". Aparece solo si la persona tiene más
de un rol (por ejemplo, un socio que también conduce). Lista de tarjetas
grandes: cada una con logo de la asociación, nombre "Asociación de
Transportistas Ejemplo", y el rol en un chip ("Conductor · Unidad 003",
"Socio · 2 unidades"). Al pie: "Puedes cambiar luego desde tu perfil".
```

### 2.3 Registrar este celular

```text
Pantalla: registro del celular del conductor. Contexto: la cuenta de un
conductor solo puede inscribirse en colas desde UN celular registrado. El
celular queda registrado en la primera inscripción exitosa.
Haz tres estados lado a lado:
A) "Este celular se registrará" — explicación corta: "La primera vez que te
   inscribas en una cola, este celular quedará como tu celular de trabajo.
   Solo desde él podrás inscribirte." Botón "Entendido".
B) "Este no es tu celular registrado" — icono de celular con advertencia,
   texto: "Tu cuenta está registrada en otro celular. Puedes ver tu cola y
   tu manifiesto, pero para inscribirte pide al administrador que cambie tu
   celular." Botón principal "Llamar al administrador", secundario
   "Entendido".
C) Permisos: tarjetas para Ubicación ("Se usa solo al momento de
   inscribirte, para confirmar que estás en el terminal. No te rastreamos
   en ruta."), Notificaciones ("Te avisamos cuando te toque LLAMANDO") y
   Cámara ("Para fotografiar manifiestos en papel"). Cada una con su
   botón "Permitir".
```

### 2.4 Estados globales

```text
Pantalla: estados globales de la app, cuatro lienzos lado a lado.
A) Sin conexión: la pantalla de Inicio de un conductor con una franja
   superior ámbar "Sin conexión — mostrando datos de las 10:42" y los
   botones de acción deshabilitados con el texto "Necesitas conexión".
B) Actualización obligatoria: pantalla completa, icono de descarga, "Hay
   una nueva versión de CHASKI RUTA", "Para seguir usando la app necesitas
   actualizarla.", botón "Actualizar ahora".
C) Error del servidor: "No pudimos cargar tu información", botón
   "Reintentar".
D) Notificación push del sistema (Android): "CHASKI RUTA · Te toca:
   estás LLAMANDO en Ciudad A → Ciudad B. Abre tu manifiesto."
```

---

## 3. Conductor (canal principal)

Navegación inferior de 5 pestañas: **Inicio · Cola · Manifiesto · Viajes ·
Perfil**. Campana de avisos arriba a la derecha con contador. Si la unidad
tiene GPS (PRO o GPS Vehicular), en Perfil aparece "GPS de mi unidad".

Botón de alerta: en la cabecera, siempre visible, un icono rojo de
triángulo de advertencia (ver 3.9).

### 3.1 Inicio — el corazón de la app

Es la pantalla más importante. Pídela en dos tandas.

```text
Pantalla: Inicio del conductor, TANDA 1 (cuatro estados lado a lado).
Cabecera común: logo de la asociación, "Hola, Carlos", debajo "Unidad 003 ·
ABC-123 · Empresa de Transportes Ejemplo S.A.C.", campana con contador y el
icono rojo de alerta.
Debajo, una tarjeta grande de "dónde estás" con el texto "Estás en
Terminal Ciudad A".
Luego una tarjeta de estado principal, distinta en cada lienzo:
A) Sin cola: "No estás en ninguna cola". Botón principal "Inscribirme en
   Ciudad A → Ciudad B". Texto debajo: "Se confirmará tu ubicación al
   inscribirte."
B) En cola: chip azul "EN COLA 4". Número grande "Te faltan 3 vehículos
   para salir". Debajo, la unidad que está LLAMANDO: "LLAMANDO: Unidad 011".
   Botón secundario de contorno "No saldré ahora".
C) LLAMANDO: tarjeta con borde y fondo cian, chip "LLAMANDO" grande, texto
   "Es tu turno. Registra a tus pasajeros." Botón principal "Abrir
   manifiesto". Sin cronómetros.
D) En ruta: chip "EN RUTA · Ciudad A → Ciudad B", "Saliste a las 10:15".
   Bloque con contador grande "42:15" y la etiqueta "Inscripción de retorno
   disponible en". Botón principal deshabilitado "Inscribirme en Ciudad B →
   Ciudad A". Nada de "llegada estimada".
Al pie de todos: tarjeta pequeña "Resumen de hoy: 2 vueltas completadas" y
un botón de texto "Mostrar QR de cobro" (Yape/Plin).
```

```text
Pantalla: Inicio del conductor, TANDA 2 (cuatro estados lado a lado). Misma
cabecera que la tanda 1, ahora "Estás en Terminal Ciudad B".
A) Puede inscribirse: el contador llegó a cero. Botón principal activo
   "Inscribirme en Ciudad B → Ciudad A". Botón de contorno "No saldré ahora".
B) Bloqueado por predecesor: tarjeta ámbar con candado: "Aún no puedes
   inscribirte — la Unidad 002 salió antes que tú y todavía no se inscribe.
   Contáctate con el administrador de tu asociación." Botón principal
   "Inscripción retrasada" (avisa al administrador). Secundario "Llamar al
   administrador".
C) Solicitud enviada: tarjeta azul "Se avisó al administrador. Te
   desbloqueará o autorizará tu inscripción." con un indicador "Esperando
   respuesta" y la hora del envío.
D) Entraste al final: aviso persistente ámbar "Otra unidad fue autorizada
   antes que tú, así que entras al final de la cola." y debajo el chip
   "EN COLA 7".
```

```text
Pantalla: Inicio del conductor, casos raros (tres lienzos lado a lado).
A) Terminal no detectado: "No sabemos en qué terminal estás. Detectamos tu
   ubicación: estás a 0,3 km de Terminal Ciudad B." Dos botones grandes,
   uno por ruta: "Inscribirme en Ciudad B → Ciudad A" (principal) y "Estoy
   en el otro terminal" (contorno).
B) Llegada sin confirmar: franja informativa gris azulada "Tu viaje sigue
   en curso desde las 08:10. Cuando llegues, inscríbete en el retorno."
   No es un error, es informativo.
C) Asociación sin terminales configurados: estado vacío "Tu asociación aún
   no termina de configurar sus terminales. Todavía no puedes inscribirte
   en colas." Sin botón principal.
```

### 3.2 Cola

```text
Pantalla: Cola del conductor. Arriba un selector de dos segmentos:
"Ciudad A → Ciudad B" | "Ciudad B → Ciudad A", con el contador de unidades
en cada uno. Texto pequeño "Actualizado hace 3 s" con un punto verde.
Lista vertical: cada fila con número de posición grande a la izquierda,
código de unidad en negrita ("011"), placa y empresa debajo en gris, y a
la derecha el chip de estado. Fila 1: chip LLAMANDO cian. Filas 2-8:
"EN COLA 2"... La fila del propio conductor (Unidad 003, EN COLA 4) está
resaltada con fondo #EFF6FF, borde primario y la etiqueta "Tú".
Al final de la lista, separadas y en gris, las unidades que ya salieron
("SALIÓ") sin número de posición.
Barra fija inferior (sobre la navegación) solo si está en cola: botón de
contorno "No saldré ahora".
Haz un segundo lienzo con el diálogo de confirmación de "No saldré ahora":
"Saldrás de la cola y, cuando vuelvas a inscribirte, entrarás al final. No
recuperas tu lugar." Botones "Cancelar" y "Sí, salir de la cola" (rojo).
```

### 3.3 Manifiesto — preparar y registrar pasajeros

```text
Pantalla: Manifiesto del conductor, cuatro lienzos lado a lado.
A) Bloqueado: cuando NO está LLAMANDO. Icono de documento con candado:
   "Podrás abrir tu manifiesto cuando estés LLAMANDO." Debajo su posición
   actual "EN COLA 4".
B) Mapa de asientos: cabecera "Manifiesto · Ciudad A → Ciudad B · Unidad
   003", chip LLAMANDO. Cuatro indicadores en fila: Pasajeros 12,
   Capacidad 20, Libres 8, Total S/ 240.00. Mapa de asientos de minivan
   (conductor adelante a la izquierda, 20 asientos numerados): libres en
   blanco con borde, ocupados en primario con iniciales, el seleccionado
   con borde acento. Debajo, lista compacta de pasajeros. Botón principal
   abajo "Guardar y cerrar manifiesto".
C) Hoja inferior "Agregar pasajero · Asiento 7": selector de tipo de
   documento (DNI / Carné de extranjería / Pasaporte), campo número de
   documento con teclado numérico, "Nombres", "Apellidos", "Origen" y
   "Destino" (desplegables con las paradas de la ruta), "Tarifa S/",
   y medio de pago con tres botones grandes con logo: Efectivo, Yape, Plin.
   Botón "Agregar". Muestra un error de validación en el DNI: "El DNI debe
   tener 8 dígitos".
D) Confirmación de cierre: diálogo "¿Cerrar el manifiesto con 12
   pasajeros? Después no podrás editarlo; una corrección queda registrada."
   Opción con casilla: "Llevo pasajeros en papel que no alcancé a registrar
   (quedará pendiente de digitalizar)". Botones "Revisar" y "Cerrar
   manifiesto".
```

### 3.4 Manifiesto cerrado y salida

```text
Pantalla: después de cerrar el manifiesto, tres lienzos lado a lado.
A) Manifiesto cerrado: check verde, "Manifiesto N.° 000184 cerrado", resumen
   (12 pasajeros, S/ 240.00, Efectivo S/ 120.00 · Yape S/ 80.00 · Plin
   S/ 40.00). Botones secundarios "Ver PDF" y "Compartir por WhatsApp".
   Botón principal grande "Marcar salida".
B) Confirmación de salida: "¿Confirmas que sales ahora? Se registra la hora
   real de salida y la siguiente unidad pasa a LLAMANDO." Botones
   "Cancelar" y "Sí, salgo ahora".
C) Visor del PDF del manifiesto: documento A4 a escala con logo de la
   asociación, número, ruta, unidad, conductor, tabla de pasajeros con
   asiento, documento enmascarado (****5678), tarifa y pago, y un código QR
   de verificación abajo. Barra inferior: "Descargar" y "Compartir".
```

### 3.5 Manifiestos pendientes de digitalizar (con IA)

```text
Pantalla: "Manifiestos sin completar", tres lienzos lado a lado.
A) Lista: tarjetas de manifiestos cerrados con respaldo en papel, chip ámbar
   "Pendiente de digitalizar", fecha y hora, ruta y plazo "Digitalizar
   antes de las 20:00".
B) Captura: vista de cámara con un recuadro guía sobre una hoja de papel y
   el texto "Encuadra el manifiesto completo". Botón de disparo.
C) Revisión: "Revisa lo que leímos de la foto". Lista de pasajeros
   prellenados; los campos dudosos con borde ámbar y la nota "Verifica este
   dato". Botón principal "Confirmar y guardar". No se pueden agregar
   pasajeros que no estén en el papel.
```

### 3.6 QR de cobro (Yape / Plin)

```text
Pantalla: QR de cobro a pantalla completa para que el pasajero lo escanee.
Selector arriba Yape | Plin con sus logos. QR grande centrado sobre fondo
blanco, nombre del titular y número de celular enmascarado (*** *** 789).
Brillo máximo sugerido con un icono de sol. Botón "Cerrar". Un segundo
lienzo con el estado vacío: "Aún no configuraste tu QR de Yape. Agrégalo
en Perfil → Cobros."
```

### 3.7 Mis viajes

```text
Pantalla: Mis viajes del conductor. Filtro de fecha arriba (Hoy, Ayer,
Esta semana). Lista agrupada por día; cada viaje: ruta, hora de salida y
hora de llegada, chip de estado (EN RUTA cian / COMPLETADO verde /
REUBICACIÓN gris "Vacío, sin cobro"). Importante: el conductor NO ve el
detalle de pasajeros ni la recaudación de manifiestos cerrados; las filas
no se abren en un detalle de manifiesto. Estado vacío: "Todavía no hay
viajes hoy".
```

### 3.8 Avisos

```text
Pantalla: Avisos del conductor. Lista de notificaciones con icono por tipo:
"Te toca: estás LLAMANDO", "El administrador autorizó tu inscripción
retrasada", "Tu solicitud fue rechazada: (motivo)", "Aviso de la
asociación: reunión el sábado 9:00", "Tu SOAT vence en 12 días". No
leídas con punto primario y fondo #EFF6FF. Botón de texto "Marcar todo
como leído".
```

### 3.9 Botón de alerta / incidente

```text
Pantalla: alerta del conductor, dos lienzos lado a lado.
A) Hoja inferior "¿Qué pasó?": opciones grandes con icono — Avería
   mecánica, Choque o accidente, Robo o asalto, Perdí o me cambiaron el
   celular, Otro. Campo opcional "Detalles". Botón rojo "Enviar alerta al
   administrador". Texto: "Si hay heridos, llama primero al 105 / 116."
   con botones de llamada.
B) Alerta enviada: "El administrador recibió tu alerta a las 11:42."
   Botón principal "Llamar al administrador".
```

### 3.10 Perfil

```text
Pantalla: Perfil del conductor. Cabecera con iniciales, nombre "Carlos
Quispe Ramos", rol y asociación. Secciones como lista agrupada:
- Información personal (teléfono, correo — el correo no se edita).
- Unidad asignada: Unidad 003, ABC-123, Minivan, 20 asientos, empresa.
- Documentos de la unidad: SOAT "Vigente · vence en 120 días" (verde),
  Revisión técnica "Por vencer · vence en 12 días" (ámbar), Tarjeta de
  propiedad "No registrada · Pide a tu administrador que la registre".
- Cobros: QR de Yape y QR de Plin (configurar / cambiar).
- Celular registrado: "Este celular · registrado el 02/10/2026".
- GPS de mi unidad (solo si la unidad tiene GPS).
- Apariencia: claro / oscuro / sistema.
- Cambiar contraseña, Cerrar sesión (rojo).
```

### 3.11 GPS de mi unidad (solo unidades con GPS)

```text
Pantalla: GPS de mi unidad (el conductor la ve solo mientras tenga la
unidad asignada y la unidad tenga GPS). Dos lienzos lado a lado.
A) Con señal: mapa a pantalla casi completa con el marcador de la unidad
   003; tarjeta inferior: "En movimiento · 62 km/h · Motor encendido ·
   Última señal hace 15 s". Botón "Reportar falla de GPS".
B) Sin señal: el marcador gris con borde punteado, tarjeta "Sin señal ·
   Última posición válida 09:58 (hace 47 min)". Texto: "La unidad puede ya
   no estar en este punto." Sin animaciones de "en vivo".
```

---

## 4. Socio

Navegación inferior: **Resumen · Unidades · Viajes · Incidencias · Más**.
"Más" contiene Avisos, Producción y, si alguna unidad tiene GPS: GPS en
vivo, Historial GPS, Alertas GPS, Bloqueo de motor y Plan GPS.

### 4.1 Resumen

```text
Pantalla: Resumen del socio. Saludo "Hola, Rosa". Selector de periodo (Hoy,
Semana, Mes). Cuatro indicadores: Vueltas 14, Pasajeros 238, Recaudado
S/ 4,760.00, Unidades activas 2 de 2. Lista "Mis unidades ahora": cada
unidad con código, conductor, y su estado de cola actual (chip LLAMANDO /
EN COLA 3 / EN RUTA / Fuera de servicio). Una tarjeta de alerta roja si
hay algo sospechoso: "Unidad 014: 2 días con viajes sin manifiesto. Ver
detalle".
```

### 4.2 Mis unidades y detalle

```text
Pantalla: Mis unidades del socio, dos lienzos.
A) Lista de tarjetas: código, placa, tipo, conductor asignado, chip de plan
   ("Operación" o "GPS Vehicular"), y estado de documentos con semáforo.
B) Detalle de la Unidad 003: datos del vehículo, conductor asignado con
   botón de llamar, documentos con vencimientos, resumen del mes (vueltas,
   pasajeros, recaudado) y "Historial de conductores".
```

### 4.3 Viajes y manifiestos

```text
Pantalla: Viajes del socio, dos lienzos.
A) Lista de viajes de sus unidades con filtro por unidad y fecha. Cada fila:
   unidad, ruta, salida/llegada, pasajeros, monto.
B) Detalle de manifiesto (el socio SÍ lo ve, solo de sus unidades):
   número, ruta, conductor, pasajeros con documento enmascarado, totales
   por medio de pago, botones "Ver PDF" y "Compartir".
```

### 4.4 Producción e incidencias

```text
Pantalla: dos lienzos lado a lado.
A) Producción: gráfico de barras simple de recaudación por día (últimos 7
   días) por unidad, y debajo una tabla compacta con totales por medio de
   pago (Efectivo, Yape, Plin).
B) Incidencias: lista de incidencias de sus unidades (alertas del conductor,
   manifiestos pendientes de digitalizar, documentos vencidos), cada una
   con chip de severidad y fecha.
```

### 4.5 GPS del socio (solo unidades con GPS)

```text
Pantalla: GPS del socio, cuatro lienzos lado a lado.
A) GPS en vivo: mapa con sus unidades con GPS; hoja inferior deslizable con
   la lista (código, velocidad, motor, última señal). Una de ellas "Sin
   señal" en gris.
B) Historial: selector de unidad y fecha; recorrido dibujado en el mapa con
   paradas numeradas; resumen "182 km · 6 paradas · 4 h 20 min en
   movimiento".
C) Alertas GPS: lista (exceso de velocidad, desconexión de energía, salida
   de zona), cada una con hora y botón "Ver en mapa".
D) Bloqueo de motor: tarjeta de la unidad con estado "Motor habilitado".
   Botón rojo "Bloquear motor" y advertencia: "Solo se ejecuta con el
   vehículo detenido. Queda registrado quién lo hizo y por qué." Diálogo de
   confirmación con campo obligatorio "Motivo".
```

---

## 5. Administrador (respuesta rápida)

La app del administrador **no** reemplaza la web: solo atiende excepciones
en el momento. Navegación inferior: **Inicio · Colas · Solicitudes · Viajes
· Más**. "Solicitudes" lleva contador rojo de pendientes.

### 5.1 Inicio

```text
Pantalla: Inicio del administrador. Arriba, dos tarjetas lado a lado, una
por terminal: "Terminal Ciudad A" y "Terminal Ciudad B", cada una con
"LLAMANDO: Unidad 011" (chip cian) y "8 en cola". Debajo, una sección
"Requiere tu atención" con tarjetas accionables: "2 inscripciones
retrasadas", "1 alerta de conductor: avería — Unidad 007", "1 llegada sin
confirmar — Unidad 019 · Juan Pérez · botón llamar", "3 manifiestos
pendientes de digitalizar". Al pie: "Hoy: 46 vueltas · 812 pasajeros".
```

### 5.2 Colas

```text
Pantalla: Colas del administrador, dos lienzos.
A) Igual que la cola del conductor (selector de dos rutas, lista con
   LLAMANDO, EN COLA 2...), pero cada fila tiene un menú "⋮" con: Llamar al
   conductor, Inscribir por el conductor, Mover posición, Retirar de la
   cola.
B) Hoja inferior "Mover posición · Unidad 014": selector de nueva posición
   y campo OBLIGATORIO "Motivo" (no se puede confirmar vacío). Texto: "Este
   cambio queda en la auditoría con tu nombre, la hora y el motivo." Botón
   "Confirmar cambio".
```

### 5.3 Solicitudes (inscripciones retrasadas y autorizaciones)

```text
Pantalla: Solicitudes del administrador, tres lienzos.
A) Lista con dos pestañas: "Inscripción retrasada (2)" y "Autorización de
   inscripción (1)". Cada tarjeta: unidad que pide, conductor, ruta, hora,
   y el motivo: "Bloqueada por la Unidad 002, que salió antes y no se ha
   inscrito".
B) Detalle de inscripción retrasada: datos de las dos unidades (la que pide
   y la que bloquea) con botón "Llamar" en cada una. Dos acciones:
   "Autorizar inscripción" (principal) y "Llamaré a la Unidad 002"
   (contorno). Campo "Motivo" obligatorio para autorizar.
C) Autorización de inscripción: "La Unidad 021 quiere inscribirse en Ciudad
   B → Ciudad A sin venir de la cola contraria". Botones "Autorizar" y
   "Rechazar", ambos con motivo obligatorio.
```

### 5.4 Reubicación

```text
Pantalla: Reubicación del administrador, dos lienzos.
A) Vista de ambas colas lado a lado en forma compacta, con el conteo de cada
   terminal destacado ("Terminal Ciudad A: 14 unidades · Terminal Ciudad B:
   3 unidades"). El administrador marca con casillas las unidades a enviar
   vacías; el orden en que las marca aparece como número (1, 2, 3).
B) Confirmación: "Enviar 3 unidades vacías de Terminal Ciudad A a Terminal
   Ciudad B", lista ordenada, campo "Motivo" obligatorio y nota "Los
   viajes quedan registrados como vacío, sin cobro". Botón "Ordenar
   reubicación". Es una decisión directa del administrador: no hay paso de
   propuesta ni aceptación por unidad.
```

> Nota para el equipo: el código actual del backend todavía usa el modelo
> antiguo (propuesta → autorización → aceptación). Este mockup sigue la
> regla del documento maestro §6.6. Hay que resolver esa brecha antes de
> programar esta pantalla (ver §8).

### 5.5 Excepciones: alertas y celular

```text
Pantalla: excepciones del administrador, dos lienzos.
A) Detalle de alerta de conductor: tipo "Avería mecánica", unidad,
   conductor con botón llamar, hora, detalle escrito por el conductor.
   Acciones: "Retirar de la cola", "Poner en LLAMANDO manualmente" (solo
   para excepciones, con motivo), "Marcar como resuelta".
B) Cambiar celular registrado: "Carlos Quispe · celular registrado el
   02/10/2026". Advertencia: "El celular actual dejará de poder
   inscribirse." Campo "Motivo" obligatorio (Celular perdido / Robado /
   Cambio de equipo / Otro). Botón "Liberar celular".
```

### 5.6 Viajes, manifiestos y GPS de flota

```text
Pantalla: tres lienzos lado a lado.
A) Viajes recientes: lista filtrable por ruta y estado; chip "Llegada sin
   confirmar" en gris azulado donde aplique.
B) Manifiesto (detalle de solo lectura): igual al del socio, con botón "Ver
   PDF".
C) GPS de flota (SOLO si la asociación tiene plan PRO): mapa con todas las
   unidades con GPS, filtros "En movimiento / Detenidas / Sin señal".
   Si la asociación está en plan Operación, en su lugar muestra una
   pantalla informativa: "El mapa de flota está disponible con el plan PRO"
   y botón "Solicitar PRO" (la activación la hace CHASKI AI).
```

---

## 6. Inventario de pantallas (para controlar el avance)

| # | Pantalla | Rol | Estados | Hecho |
|---|---|---|---|---|
| 2.1 | Splash y login | Todos | 2 | ☐ |
| 2.2 | Elegir asociación o rol | Todos | 1 | ☐ |
| 2.3 | Registrar celular y permisos | Conductor | 3 | ☐ |
| 2.4 | Estados globales | Todos | 4 | ☐ |
| 3.1 | Inicio (tanda 1, 2 y casos raros) | Conductor | 11 | ☐ |
| 3.2 | Cola | Conductor | 2 | ☐ |
| 3.3 | Manifiesto — registro | Conductor | 4 | ☐ |
| 3.4 | Manifiesto cerrado y salida | Conductor | 3 | ☐ |
| 3.5 | Pendientes de digitalizar (IA) | Conductor | 3 | ☐ |
| 3.6 | QR de cobro | Conductor | 2 | ☐ |
| 3.7 | Mis viajes | Conductor | 1 | ☐ |
| 3.8 | Avisos | Conductor | 1 | ☐ |
| 3.9 | Alerta / incidente | Conductor | 2 | ☐ |
| 3.10 | Perfil | Conductor | 1 | ☐ |
| 3.11 | GPS de mi unidad | Conductor | 2 | ☐ |
| 4.1 | Resumen | Socio | 1 | ☐ |
| 4.2 | Mis unidades y detalle | Socio | 2 | ☐ |
| 4.3 | Viajes y manifiestos | Socio | 2 | ☐ |
| 4.4 | Producción e incidencias | Socio | 2 | ☐ |
| 4.5 | GPS del socio | Socio | 4 | ☐ |
| 5.1 | Inicio | Admin | 1 | ☐ |
| 5.2 | Colas e intervención | Admin | 2 | ☐ |
| 5.3 | Solicitudes | Admin | 3 | ☐ |
| 5.4 | Reubicación | Admin | 2 | ☐ |
| 5.5 | Alertas y celular | Admin | 2 | ☐ |
| 5.6 | Viajes, manifiestos y GPS de flota | Admin | 3 | ☐ |

Además, al terminar: modo oscuro de 3.1 (estado LLAMANDO), 3.2 y 3.3 (mapa
de asientos), para validar el contraste.

---

## 7. Lista de revisión de cada mockup

Rechaza y pide corrección si aparece cualquiera de estas cosas:

- [ ] Un nombre de ciudad real (Juli, Puno, Lima…) en lugar de "Ciudad A /
      Ciudad B".
- [ ] "Llegada estimada", "ETA", "llegas en" o cualquier lectura del
      contador de 60 minutos como hora de llegada.
- [ ] Un cronómetro o "tiempo restante" sobre LLAMANDO.
- [ ] Un botón "Marcar llegada".
- [ ] "EN COLA 1".
- [ ] Mapas o coordenadas en una pantalla de plan Operación.
- [ ] Un marcador "en vivo" en una unidad sin señal.
- [ ] Nombre del pasajero en un solo campo, o DNI sin teclado numérico.
- [ ] El conductor viendo el detalle de pasajeros o la recaudación de un
      manifiesto ya cerrado.
- [ ] Una acción del administrador que cambia la cola sin pedir motivo.
- [ ] Un flujo de "aceptar reubicación" por parte del conductor o socio.
- [ ] Un rol Super Admin dentro de la app.
- [ ] Botones de menos de 48 dp, texto menor a 13, texto gris claro sobre
      blanco.
- [ ] Colores fuera de la paleta del brief, emojis o ilustraciones
      decorativas.
- [ ] Un botón "Crear cuenta" o "Registrarse".

---

## 8. Lo que los mockups no resuelven (pendiente antes de programar)

Prototipo navegable (Figma Make, 20 oct 2026):
https://www.figma.com/make/mSbGPsBYB7ukWb58hwDR5S/Prototipo-app-CHASKI-RUTA
— incluye la pestaña Comunidad del conductor (red privada de la asociación).

Los puntos 1-3 quedaron construidos en el backend el 20 de octubre de 2026
(`backend/src/auth/mobile-auth.*`, `backend/src/push/`, tabla
`mobile_sessions`):

1. ✅ **Notificaciones push:** Firebase Cloud Messaging (HTTP v1; iOS sale
   por APNs a través de Firebase). Se envían en cada aviso (administrador,
   Super Admin y avisos privados del sistema) y cuando una unidad pasa a
   LLAMANDO. **Falta crear el proyecto de Firebase** y cargar
   `FIREBASE_SERVICE_ACCOUNT_JSON` en Railway; sin eso queda apagado.
2. ✅ **Sesión móvil:** `POST /auth/mobile/google` (idToken de Google
   Sign-In nativo), `/auth/mobile/login`, `/auth/mobile/select-profile`,
   `/auth/mobile/refresh` (token de renovación rotativo, 60 días),
   `/auth/mobile/logout` y `PUT /auth/mobile/push-token`. Acceso de 1 h.
3. ✅ **Celular registrado:** la app manda un identificador de instalación al
   iniciar sesión; viaja firmado en el JWT (`did`) y es el que se compara con
   el celular registrado al inscribirse. Un conductor que hoy usa la web en
   su celular tendrá otro identificador en la app: el administrador debe
   liberar el celular una vez cuando el conductor pase a la app.

Pendiente:
4. **Reubicaciones:** decidir el modelo (directo, como dice el documento
   maestro, o el de propuesta/aceptación que tiene el código hoy).
5. **Decisiones de §3 de `plataformas-web-y-app-nativa.md`:** navegación,
   estrategia sin señal, actualización obligatoria, distribución de la
   beta y fecha de publicación en Google Play y App Store.
