# Arquitectura técnica — CHASKI RUTA

Decisiones tomadas en conversación de producto (agosto 2026). Este documento es el complemento técnico de `plan-operacion.md`, `plan-pro.md` y `plan-gps-vehicular.md` — aquí va el "cómo se construye", allá el "qué hace".

## 1. Stack

- **Frontend web:** React + Vite — el proyecto actual en VS Code, `Plataforma web - chaski ai` (generado originalmente en Figma Make). Versiones confirmadas en `package.json` (8 de septiembre de 2026): React `^19.0.0`, Vite `^8.0.5`. Es la base de todo: primero se valida ahí la lógica y el diseño.
- **App móvil:** **corrección (8 de septiembre de 2026) — se elimina Capacitor de la arquitectura aprobada.** La app nativa es un proyecto independiente, no un envoltorio de la web (no usa Capacitor ni WebView). Tecnología decidida: **Flutter**. Se construye al final del roadmap, después de consolidar el sistema web — ver `plataformas-web-y-app-nativa.md`. Se publica primero en **Google Play** (Android), después en **App Store** (iOS).
- **Backend:** **construido y en producción** — NestJS + Prisma + PostgreSQL, desplegado en **Railway** (migrado desde Google Cloud Run el 2 de octubre de 2026 — ver `infraestructura-y-despliegue.md` §2 para el motivo). Ya no queda ninguna pantalla dependiendo de `demo.ts` — verificado directo en el código (`grep` de importaciones a `data/demo` en `src/` no devuelve resultados). Ver `infraestructura-y-despliegue.md` para el detalle completo de dónde y por qué.
- **Base de datos:** PostgreSQL real, alojada en **Railway** (migrada desde Google Cloud SQL el 23 de septiembre de 2026, con verificación fila por fila de que no se perdió nada). pgAdmin/DBeaver siguen siendo solo herramientas de cliente para consultarla, nunca la base de datos en sí. Detalle completo en `infraestructura-y-despliegue.md` §4.
- **GPS/telemetría (PRO y GPS Vehicular):** Teltonika FMC130 → servidor Traccar (ya corriendo en un VPS de DigitalOcean) → backend CHASKI AI → app/web.
- **Asistente conversacional:** API de Claude, con function/tool calling contra datos reales — nunca genera cifras libremente. Dos canales: panel admin (alcance amplio) y WhatsApp (alcance acotado a cola general + perfil propio). Ver `plan-pro.md` §6 y §8.
- **WhatsApp:** WhatsApp Business Platform (Meta Cloud API, vía un proveedor tipo Twilio/360dialog/Gupshup) — no la app normal de WhatsApp Business.
- **Mini-mapa del conductor:** API de Google Maps (JavaScript), posición desde `navigator.geolocation` del navegador — ya implementado, es privado y no depende del backend de GPS de flota.

## 2. Dominio y correo

- **Dominio:** `ChaskiAI.com.pe`, registrado en Punto.pe a nombre de Import Star Peruvian EIRL (RUC de otro negocio del fundador — no hace falta que el nombre del dominio coincida con el titular legal).
- **Correo:** Google Workspace sobre ese dominio, para el equipo de CHASKI AI y para que las invitaciones/notificaciones salgan de una dirección profesional (ej. `notificaciones@chaskiai.com.pe`) en vez de un Gmail personal.
- **Los clientes no reciben cuentas asignadas:** gerentes, socios y conductores siguen usando su Gmail gratuito existente — inician sesión con "Sign in with Google" (OAuth) **o** con su correo y una contraseña propia que ellos mismos crean desde el correo de bienvenida (actualizado 19 de septiembre de 2026). CHASKI AI nunca ve ni guarda una contraseña en claro (solo su cifrado).
- **Envío masivo/transaccional de correos** (invitaciones, verificación de cuenta): Workspace por sí solo no está pensado para ese volumen — se necesita un servicio de correo transaccional aparte (SendGrid, Postmark, Amazon SES, Resend) autenticado sobre el mismo dominio.

## 3. Despliegue

- **Frontend:** hosting de sitio estático (Vercel, Netlify o Render). **Corrección (8 de septiembre de 2026):** un frontend estático no mantiene un proceso permanente que "duerma" — eso no aplica a la landing ni a la plataforma web como archivos estáticos. El posible "cold start" real corresponde al **backend**, a funciones serverless o a la base de datos, según dónde se hospeden. No corresponde justificar automáticamente un plan pagado del hosting estático solo por evitar que "duerma" — evaluar el plan pagado según tráfico, límites de build o necesidades reales, no por ese motivo.
- **Backend:** **decidido y en producción** — Railway (antes Google Cloud Run; migrado el 2 de octubre de 2026 por costo, ver `infraestructura-y-despliegue.md` §2), no el VPS de DigitalOcean.
- El aislamiento por asociación (§4, punto 1) ya está construido y en uso con datos reales de ATIPCAR en producción — la advertencia de esta línea sobre "no cargar datos reales hasta que esté construido" ya se cumplió y quedó atrás.
- Nota de confiabilidad: el hosting en la nube (Vercel/Render/DigitalOcean/AWS) es más robusto que un servidor propio — lo único que ninguna nube resuelve es que se caiga el internet de la terminal misma en Juli o Puno; para eso ya existe el respaldo en papel del manifiesto (`plan-operacion.md` §3.8).
- **Advertencia de SEO (agregada 8 de septiembre de 2026):** en una SPA de Vite, modificar meta tags desde JavaScript (por ejemplo para el SEO administrable de la landing, ver `landing-publica-y-solicitudes-comerciales.md` §9) **no garantiza** vistas previas correctas en todos los robots de búsqueda ni en las redes sociales — muchos de esos rastreadores no ejecutan JavaScript. Un `og:image` o meta tags administrables de verdad probablemente requieren prerenderizado, SSR o una capa dinámica aparte. `PENDIENTE DE DECISIÓN` cuál solución técnica exacta se usa — **no afirmar que el SEO dinámico ya está resuelto.**

## 4. Orden de construcción del backend (prioridad)

No se construye todo junto — este es el orden acordado:

1. ✅ **Autenticación real + aislamiento obligatorio por `organization_id`** — construido y verificado de punta a punta (agosto 2026): NestJS + Prisma + PostgreSQL, "Sign in with Google" real (invite-only: la cuenta debe existir antes como `PENDIENTE`, Google nunca crea cuentas), JWT con `organizationId`/`role`, y el frontend (`AuthContext`, `/auth/callback`, botón real de Google en `Login.tsx`) ya consume ese login real en vez del selector falso de cuentas demo.
2. ✅ **Motor real del Plan Operación** — construido y verificado de punta a punta (agosto 2026): vehículos/empresas, colas con las reglas de integridad completas (regla dura de secuencia, vínculo cuenta-dispositivo, tiempo mínimo de viaje configurable, cadena de predecesores, botón de alerta — el timeout y el escape de 3 vías basados en tiempo quedaron eliminados el 4 de septiembre, ver `plan-operacion.md` §3.6), manifiestos (apertura, pasajeros, cierre, corrección con versión y auditoría). **`BRECHA CONFIRMADA (auditada 15 de septiembre de 2026) — SIGUE PENDIENTE DE DECISIÓN, no corregida:** se auditó `relocations.service.ts` y `RelocationsPage.tsx` contra la regla vigente (`DOCUMENTO_MAESTRO_NEGOCIO_Y_PRODUCTO.md` §6.6). Resultado: el código real **sí implementa el modelo antiguo** — una orden nace en estado `PROPUESTA` (aunque el administrador ya eligió las unidades al crearla), requiere un paso separado de `AUTORIZADA`, y cada unidad necesita un `acceptUnit()` propio antes de poder iniciar traslado (la pantalla admin incluso lo llama "Simular aceptar", sugiriendo que ese paso nunca se pensó para que lo haga de verdad un socio/conductor). Esto **no coincide** con la regla vigente de "el administrador decide y selecciona directamente, sin flujo de propuesta/aceptación por unidad". Sigue sin resolverse cuál de los dos modelos es el correcto para seguir construyendo — requiere una decisión de producto, no un ajuste de documentación.**
2.1 ✅ **Frontend conectado al motor real** (agosto 2026, ampliado hasta septiembre): `src/lib/operacion-api.ts` es la capa de cliente real (fetch + JWT + adaptadores a los tipos del frontend). **Actualización 15 de septiembre de 2026: ya no queda ninguna pantalla en `demo.ts`** — verificado con una búsqueda de importaciones a `data/demo` en todo `src/`, sin resultados. Colas, Manifiestos, Viajes, Flota, Personas, Empresas, Reportes, Auditoría, todo lo de GPS, Configuración, Centro de operaciones, panel de Socio, Super Admin y el panel de Conductor completo (Cola, Manifiesto, Inicio, Perfil, Mis viajes) consumen el backend real. La lógica de "posición operativa" (LLAMANDO/RAMPA/EXTERIOR con color) vive compartida en `src/lib/queue-ui.ts` entre admin y conductor. Cola, Manifiesto e Inicio del conductor se refrescan solos cada 15s.
   - Nota técnica importante: para que el flujo de cola del conductor pueda encontrar "su" vehículo, el seed ahora también rellena `Person.code`/`company`/`linkedUnit` del conductor al asignarlo a su unidad (antes quedaba vacío). Si la base de datos ya tenía datos sembrados de antes de este cambio, hay que volver a correr `npx prisma db seed` en `backend/` para que se rellene ese dato en los conductores existentes.
3. **Después:** asistente conversacional (Claude), WhatsApp Business, integración real con Traccar (PRO y GPS Vehicular), avisos, recaudación por empresa, backend real de landing/formularios comerciales (`landing-publica-y-solicitudes-comerciales.md`), y las propuestas de IA de `ia-aplicada.md` (empezando por detección de accidentes, según prioridad acordada el 8 de septiembre de 2026).
4. **Al final:** la aplicación nativa en Flutter (`plataformas-web-y-app-nativa.md`) — recién cuando el sistema web y el backend anteriores estén consolidados.

## 5. Pendientes de decidir

- ¿El bot de WhatsApp aplica solo a asociaciones con PRO, o también hay una versión básica para Operación (solo cola general/turno, sin GPS ni recaudación)? (`plan-pro.md` §8) — resuelto en parte: `plan-pro.md` §8 ya decidió que WhatsApp aplica solo a PRO, pero el canal en sí sigue sin construirse.
- Modelo de reubicaciones: ver la brecha confirmada en §4, punto 2 — sigue pendiente decidir si el flujo real debe ser el directo (documentado) o el de propuesta/autorización/aceptación (el que de verdad existe en el código hoy).

**Ya resuelto:** dónde vive el backend (Railway, mismo repositorio en `backend/`, carpeta raíz `backend`) y dónde vive PostgreSQL (Railway, no el VPS de DigitalOcean) — ver `infraestructura-y-despliegue.md`. La pérdida de señal GPS al inscribirse en cola (unidades PRO) también quedó resuelta — ver `plan-pro.md` §3, "Resuelto en la implementación".

**Ya no está pendiente (decidido 8 de septiembre de 2026):** la tecnología de la app nativa es Flutter — ver `plataformas-web-y-app-nativa.md` §3. Lo que sigue abierto es únicamente el detalle técnico (navegación, estrategia offline, push, distribución de pruebas), no la tecnología en sí.

### Hallazgos de la auditoría técnica (8 de septiembre de 2026 — actualizado 15 de septiembre de 2026)

- La landing pública sigue mayormente escrita directo en el código (hardcodeada) en su estructura, pero su contenido editable (textos, imágenes, flota mostrada, planes) sí es administrable desde Super Admin → Landing pública, conectado al backend real (`landing-content` module).
- **Corregido:** el formulario de solicitud comercial de la landing ya no simula el envío — existe un módulo backend real (`backend/src/commercial-requests`), y Super Admin gestiona esas solicitudes de verdad desde "Solicitudes comerciales". Detalle completo en `landing-publica-y-solicitudes-comerciales.md`.
- **Corregido y confirmado en producción:** Resend (`backend/src/mail/mail.service.ts`) ya no es solo "existe en el código" — se verificó el envío real en producción (dominio `chaskiai.com.pe` verificado por DNS ante Resend), incluyendo correos de bienvenida, reactivación de cuenta, y tickets de soporte.
- Cloudinary se usa en producción para logos e imágenes de flota reales.
- **Corregido:** el panel de Super Admin ya no mezcla datos de `demo.ts` — verificado, cero pantallas dependen de esa fuente hoy (ver §4, punto 2.1).
- **Nuevo (15 de septiembre de 2026):** se auditó la separación real entre Plan Operación y PRO a nivel de servidor (no solo de interfaz). Se encontraron y cerraron dos endpoints (`route-geofence`, `fleet-reports`) que solo estaban protegidos por el frontend ocultando el menú — el servidor no verificaba el plan. Ahora los tres puntos exclusivos de PRO (asistente conversacional, corredor autorizado, reportes avanzados) usan la misma regla compartida (`assertProPlan()` en `backend/src/common/tenant.ts`).
- **Nuevo (15 de septiembre de 2026):** endurecimiento de seguridad general — límite de peticiones por IP (`@nestjs/throttler`, más estricto en login/recuperar contraseña) y cabeceras HTTP estándar (Helmet). Ninguno existía antes de esta fecha.
- **Nuevo (13-14 de septiembre de 2026):** "Salud técnica" (Super Admin) dejó de ser datos de ejemplo — corre un chequeo real cada 5 minutos contra base de datos, Traccar, Resend y Cloudinary, con historial y uptime real de 30 días (`backend/src/health-monitor`). Corrige la nota de `plan-pro.md` §10 que todavía la describe como "100% datos de ejemplo".

## 6. Cambios del 19 de septiembre de 2026

Todo lo de esta sección está desplegado en producción (servidor, base de datos y web) y probado.

**Dar de baja y eliminar (nada se borra de verdad)**
- `VehicleStatus.BAJA`: una unidad dada de baja sale de todas las pantallas (`fetchVehicles` la excluye por defecto; solo la pantalla de Unidades y flota la pide) y de los mapas/reportes GPS y del asistente. Endpoints: `POST /vehicles/:id/retire`, `POST /vehicles/retire-bulk` (varias, con un solo motivo; devuelve cuáles no se pudieron), `POST /vehicles/:id/restore`. Reglas: motivo obligatorio, no con viaje en curso ni en cola, le quita el conductor asignado.
- `CompanyStatus.ELIMINADA`: solo Super Admin (`POST /companies/:id/delete`, `.../restore`); solo si todas sus unidades están dadas de baja. Si se vuelve a agregar por nombre o RUC, el servidor responde `EMPRESA_ELIMINADA` y la pantalla ofrece restaurarla en vez de duplicarla.

**Cuenta propia**
- `GET/PATCH /people/me`: cada persona corrige sus datos (nunca correo, rol ni asociación: el formulario no los acepta). El Super Admin (sin asociación) también puede leer su cuenta.
- Invitación con contraseña: el correo de bienvenida trae un enlace de un solo uso (7 días). Es un token firmado con una **huella de la contraseña actual** (`pv`): al definirla, la huella cambia y el enlace deja de servir. Lo mismo aplica a "Recuperar acceso" (30 min).

**Base de datos — migraciones nuevas (todas ya aplicadas en producción)**
| Migración | Qué agrega |
|---|---|
| `20260919180000_person_license` | Licencia, categoría y vencimiento de la persona |
| `20260919200000_baja_unidad_eliminar_empresa` | Estados `BAJA` y `ELIMINADA` |
| `20260919230000_documentos_y_licencia` | `licenseIssuedAt`; tipo de documento del pasajero, del perfil de pasajero (y su índice único) y del reclamante |

**Validación y seguridad**
- Reglas centralizadas en `backend/src/common/validators.ts` (espejo en `src/lib/validators.ts`) y mensajes de error traducidos al español en `backend/src/common/validation-messages.ts`. Catálogo completo: `reglas-de-datos-y-validaciones.md`.
- Formularios públicos: límite de 10 envíos por hora y campo trampa. Largos máximos en todos los textos.

**Pantallas**
- Diseño responsive: en celular (< 768 px) el menú lateral es un cajón; en tablet (< 1024 px) arranca compacto; los paneles de detalle son pantalla completa en celular; las pestañas se desplazan dentro de su fila.
- Verificación hecha con Chrome emulando 390 px, 360 px y 820 px, recorriendo **todas** las pantallas de los cuatro paneles (incluidas las del Plan PRO) y midiendo que ninguna sea más ancha que la pantalla. Conviene repetirla al agregar una pantalla nueva.
