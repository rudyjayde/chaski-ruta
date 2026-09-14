# Arquitectura técnica — CHASKI RUTA

Decisiones tomadas en conversación de producto (agosto 2026). Este documento es el complemento técnico de `plan-operacion.md`, `plan-pro.md` y `plan-gps-vehicular.md` — aquí va el "cómo se construye", allá el "qué hace".

## 1. Stack

- **Frontend web:** React + Vite — el proyecto actual en VS Code, `Plataforma web - chaski ai` (generado originalmente en Figma Make). Versiones confirmadas en `package.json` (8 de septiembre de 2026): React `^19.0.0`, Vite `^8.0.5`. Es la base de todo: primero se valida ahí la lógica y el diseño.
- **App móvil:** **corrección (8 de septiembre de 2026) — se elimina Capacitor de la arquitectura aprobada.** La app nativa es un proyecto independiente, no un envoltorio de la web (no usa Capacitor ni WebView). Tecnología decidida: **Flutter**. Se construye al final del roadmap, después de consolidar el sistema web — ver `plataformas-web-y-app-nativa.md`. Se publica primero en **Google Play** (Android), después en **App Store** (iOS).
- **Backend:** por construir — **NestJS + Prisma + PostgreSQL**. Hoy el proyecto de VS Code no tiene ningún backend real (todo es data estática en `demo.ts`, confirmado en la auditoría).
- **Base de datos:** PostgreSQL es la base de datos real. pgAdmin **no es la base de datos, es únicamente una herramienta de administración/cliente** para verla y consultarla en desarrollo local (ya instalado). Producción: pendiente decidir entre auto-alojarla en el VPS de DigitalOcean (el mismo que ya corre Traccar) o un servicio administrado (Render Postgres, DigitalOcean Managed Database) — ver §5.
- **GPS/telemetría (PRO y GPS Vehicular):** Teltonika FMC130 → servidor Traccar (ya corriendo en un VPS de DigitalOcean) → backend CHASKI AI → app/web.
- **Asistente conversacional:** API de Claude, con function/tool calling contra datos reales — nunca genera cifras libremente. Dos canales: panel admin (alcance amplio) y WhatsApp (alcance acotado a cola general + perfil propio). Ver `plan-pro.md` §6 y §8.
- **WhatsApp:** WhatsApp Business Platform (Meta Cloud API, vía un proveedor tipo Twilio/360dialog/Gupshup) — no la app normal de WhatsApp Business.
- **Mini-mapa del conductor:** API de Google Maps (JavaScript), posición desde `navigator.geolocation` del navegador — ya implementado, es privado y no depende del backend de GPS de flota.

## 2. Dominio y correo

- **Dominio:** `ChaskiAI.com.pe`, registrado en Punto.pe a nombre de Import Star Peruvian EIRL (RUC de otro negocio del fundador — no hace falta que el nombre del dominio coincida con el titular legal).
- **Correo:** Google Workspace sobre ese dominio, para el equipo de CHASKI AI y para que las invitaciones/notificaciones salgan de una dirección profesional (ej. `notificaciones@chaskiai.com.pe`) en vez de un Gmail personal.
- **Los clientes no reciben cuentas asignadas:** gerentes, socios y conductores siguen usando su Gmail gratuito existente — inician sesión con "Sign in with Google" (OAuth), sin contraseña que gestionar.
- **Envío masivo/transaccional de correos** (invitaciones, verificación de cuenta): Workspace por sí solo no está pensado para ese volumen — se necesita un servicio de correo transaccional aparte (SendGrid, Postmark, Amazon SES, Resend) autenticado sobre el mismo dominio.

## 3. Despliegue

- **Frontend:** hosting de sitio estático (Vercel, Netlify o Render). **Corrección (8 de septiembre de 2026):** un frontend estático no mantiene un proceso permanente que "duerma" — eso no aplica a la landing ni a la plataforma web como archivos estáticos. El posible "cold start" real corresponde al **backend**, a funciones serverless o a la base de datos, según dónde se hospeden. No corresponde justificar automáticamente un plan pagado del hosting estático solo por evitar que "duerma" — evaluar el plan pagado según tráfico, límites de build o necesidades reales, no por ese motivo.
- **Backend:** mismo VPS de DigitalOcean que ya usa Traccar, o un servicio administrado aparte — se decide cuando el backend esté listo para producción (no bloquea el desarrollo).
- **Antes de exponer la URL pública:** proteger el despliegue con contraseña mientras siga siendo demo, agregar `robots.txt`/meta noindex para que no se indexe en buscadores todavía, y no cargar ningún dato real de ATIPCAR (pasajeros, pagos) hasta que el backend real con aislamiento por asociación (§4, punto 1) esté construido.
- Nota de confiabilidad: el hosting en la nube (Vercel/Render/DigitalOcean/AWS) es más robusto que un servidor propio — lo único que ninguna nube resuelve es que se caiga el internet de la terminal misma en Juli o Puno; para eso ya existe el respaldo en papel del manifiesto (`plan-operacion.md` §3.8).
- **Advertencia de SEO (agregada 8 de septiembre de 2026):** en una SPA de Vite, modificar meta tags desde JavaScript (por ejemplo para el SEO administrable de la landing, ver `landing-publica-y-solicitudes-comerciales.md` §9) **no garantiza** vistas previas correctas en todos los robots de búsqueda ni en las redes sociales — muchos de esos rastreadores no ejecutan JavaScript. Un `og:image` o meta tags administrables de verdad probablemente requieren prerenderizado, SSR o una capa dinámica aparte. `PENDIENTE DE DECISIÓN` cuál solución técnica exacta se usa — **no afirmar que el SEO dinámico ya está resuelto.**

## 4. Orden de construcción del backend (prioridad)

No se construye todo junto — este es el orden acordado:

1. ✅ **Autenticación real + aislamiento obligatorio por `organization_id`** — construido y verificado de punta a punta (agosto 2026): NestJS + Prisma + PostgreSQL, "Sign in with Google" real (invite-only: la cuenta debe existir antes como `PENDIENTE`, Google nunca crea cuentas), JWT con `organizationId`/`role`, y el frontend (`AuthContext`, `/auth/callback`, botón real de Google en `Login.tsx`) ya consume ese login real en vez del selector falso de cuentas demo.
2. ✅ **Motor real del Plan Operación** — construido y verificado de punta a punta (agosto 2026): vehículos/empresas, colas con las reglas de integridad completas (regla dura de secuencia, vínculo cuenta-dispositivo, tiempo mínimo de viaje configurable, cadena de predecesores, botón de alerta — el timeout y el escape de 3 vías basados en tiempo quedaron eliminados el 4 de septiembre, ver `plan-operacion.md` §3.6), manifiestos (apertura, pasajeros, cierre, corrección con versión y auditoría). **`BRECHA ENTRE CÓDIGO Y REGLA ACTUAL — REQUIERE AUDITORÍA Y CORRECCIÓN`:** esta línea describía viajes y reubicaciones como "propuesta → autorización → aceptación por unidad → traslado → compensación registrada en auditoría", pero la regla vigente (`DOCUMENTO_MAESTRO_NEGOCIO_Y_PRODUCTO.md` §6.6) es que el administrador decide y selecciona las unidades directamente, sin flujo de propuesta/aceptación por unidad. No se sabe todavía si el código real implementa el modelo antiguo (propuesta/aceptación) o ya el directo — falta auditar `relocations.service.ts` contra la regla vigente antes de corregir esta línea con certeza.
2.1 ✅ **Frontend conectado al motor real — Colas, Manifiestos, Viajes** (agosto 2026): `src/lib/operacion-api.ts` es la capa de cliente real (fetch + JWT + adaptadores a los tipos del frontend). Ya consumen el backend real en vez de `demo.ts`: pantalla de Colas (admin) — con inscripción manual de unidad, confirmación de llegada por GPS del navegador, avanzar cadena, salió a viaje, escape de 3 vías; pantalla de Manifiestos (admin) — listado real, mapa de asientos real por tipo de vehículo para agregar pasajeros, corrección con nueva versión; pantalla de Viajes (admin) — listado real; y del lado del conductor en la app (`DriverApp.tsx`) — Cola (inscribirse, confirmar llegada por GPS, "me inscribo más tarde", posición operativa con color igual que el admin), Manifiesto (abrir/agregar pasajeros con mapa de asientos real/cerrar/completar pendientes de papel), e Inicio (estado real de cola/viaje, terminal actual inferido — §3.11 de `plan-operacion.md`). La lógica de "posición operativa" (LLAMANDO/RAMPA/EXTERIOR con color) vive compartida en `src/lib/queue-ui.ts` entre admin y conductor. Cola, Manifiesto e Inicio del conductor se refrescan solos cada 15s. Sigue en `demo.ts` a propósito, por decisión explícita (no tocar sin pedirlo de nuevo): Flota, Personas, Empresas, Reportes, Auditoría, todo lo de GPS, Configuración, Kiosco de terminal, Centro de operaciones, App de socio, y SuperAdmin — además de Perfil y Mis viajes del conductor.
   - Nota técnica importante: para que el flujo de cola del conductor pueda encontrar "su" vehículo, el seed ahora también rellena `Person.code`/`company`/`linkedUnit` del conductor al asignarlo a su unidad (antes quedaba vacío). Si la base de datos ya tenía datos sembrados de antes de este cambio, hay que volver a correr `npx prisma db seed` en `backend/` para que se rellene ese dato en los conductores existentes.
3. **Después:** asistente conversacional (Claude), WhatsApp Business, integración real con Traccar (PRO y GPS Vehicular), avisos, recaudación por empresa, backend real de landing/formularios comerciales (`landing-publica-y-solicitudes-comerciales.md`), y las propuestas de IA de `ia-aplicada.md` (empezando por detección de accidentes, según prioridad acordada el 8 de septiembre de 2026).
4. **Al final:** la aplicación nativa en Flutter (`plataformas-web-y-app-nativa.md`) — recién cuando el sistema web y el backend anteriores estén consolidados.

## 5. Pendientes de decidir

- ¿El bot de WhatsApp aplica solo a asociaciones con PRO, o también hay una versión básica para Operación (solo cola general/turno, sin GPS ni recaudación)? (`plan-pro.md` §8)
- Dónde vivirá el código del backend: ¿carpeta nueva dentro de `Plataforma web - chaski ai`, o un proyecto/repositorio separado al lado?
- Hosting de producción para PostgreSQL: ¿VPS propio de DigitalOcean (junto con Traccar) o un servicio administrado?
- Pérdida de señal GPS al inscribirse en cola (unidades PRO) — ver `plan-pro.md` §3 (la inscripción 100% automática por geocerca ya se descartó el 4 de septiembre de 2026: el conductor siempre decide, el hardware solo reemplaza al celular como fuente de GPS).

**Ya no está pendiente (decidido 8 de septiembre de 2026):** la tecnología de la app nativa es Flutter — ver `plataformas-web-y-app-nativa.md` §3. Lo que sigue abierto es únicamente el detalle técnico (navegación, estrategia offline, push, distribución de pruebas), no la tecnología en sí.

### Hallazgos de la auditoría técnica (8 de septiembre de 2026)

- La landing pública actual está mayormente escrita directo en el código (hardcodeada), no es administrable todavía.
- Los formularios actuales de la landing simulan el envío con estado local y `setTimeout` — no hay backend real detrás.
- Las solicitudes comerciales de ejemplo viven hoy en `demo.ts`; no existe todavía un módulo backend real de landing/formularios comerciales.
- Resend existe en el código (`backend/src/mail/mail.service.ts`, vía `fetch` directo a su API, sin el SDK) — confirmado en el código, pero es best-effort (`RESEND_API_KEY` opcional): no afirmar que el envío de correo funciona en producción sin una prueba real.
- Cloudinary existe como dependencia real del backend y puede reutilizarse.
- El panel de Super Admin mezcla pantallas conectadas al backend real con pantallas que todavía muestran datos de `demo.ts` — que una pantalla se vea terminada no significa que ya guarde información real (detalle de qué es cada cosa en `FLUJO_NEGOCIO_ACTUAL.md`).
