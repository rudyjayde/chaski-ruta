# Arquitectura técnica — CHASKI RUTA

Decisiones tomadas en conversación de producto (agosto 2026). Este documento es el complemento técnico de `plan-operacion.md`, `plan-pro.md` y `plan-gps-vehicular.md` — aquí va el "cómo se construye", allá el "qué hace".

## 1. Stack

- **Frontend web:** React + Vite — el proyecto actual en VS Code, `Plataforma web - chaski ai` (generado originalmente en Figma Make). Es la base de todo: primero se valida ahí la lógica y el diseño.
- **App móvil:** no nativa por separado ni React Native — envoltorio híbrido con **Capacitor** sobre el mismo código web. Reutiliza casi todo lo ya construido y da acceso a lo nativo del celular (GPS, cámara para QR, notificaciones push) cuando hace falta. Se publica primero en **Google Play** (Android), después en **App Store** (iOS).
- **Backend:** por construir — **NestJS + Prisma + PostgreSQL**. Hoy el proyecto de VS Code no tiene ningún backend real (todo es data estática en `demo.ts`, confirmado en la auditoría).
- **Base de datos:** PostgreSQL. Desarrollo local vía pgAdmin (ya instalado). Producción: pendiente decidir entre auto-alojarla en el VPS de DigitalOcean (el mismo que ya corre Traccar) o un servicio administrado (Render Postgres, DigitalOcean Managed Database) — ver §5.
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

- **Frontend:** hosting de sitio estático (Vercel, Netlify o Render) — **plan pagado, no el gratuito**, para evitar que el servicio "duerma" por inactividad y se sienta lento/colgado al primer acceso del día.
- **Backend:** mismo VPS de DigitalOcean que ya usa Traccar, o un servicio administrado aparte — se decide cuando el backend esté listo para producción (no bloquea el desarrollo).
- **Antes de exponer la URL pública:** proteger el despliegue con contraseña mientras siga siendo demo, agregar `robots.txt`/meta noindex para que no se indexe en buscadores todavía, y no cargar ningún dato real de ATIPCAR (pasajeros, pagos) hasta que el backend real con aislamiento por asociación (§4, punto 1) esté construido.
- Nota de confiabilidad: el hosting en la nube (Vercel/Render/DigitalOcean/AWS) es más robusto que un servidor propio — lo único que ninguna nube resuelve es que se caiga el internet de la terminal misma en Juli o Puno; para eso ya existe el respaldo en papel del manifiesto (`plan-operacion.md` §3.8).

## 4. Orden de construcción del backend (prioridad)

No se construye todo junto — este es el orden acordado:

1. ✅ **Autenticación real + aislamiento obligatorio por `organization_id`** — construido y verificado de punta a punta (agosto 2026): NestJS + Prisma + PostgreSQL, "Sign in with Google" real (invite-only: la cuenta debe existir antes como `PENDIENTE`, Google nunca crea cuentas), JWT con `organizationId`/`role`, y el frontend (`AuthContext`, `/auth/callback`, botón real de Google en `Login.tsx`) ya consume ese login real en vez del selector falso de cuentas demo.
2. ✅ **Motor real del Plan Operación** — construido y verificado de punta a punta (agosto 2026): vehículos/empresas, colas con las reglas de integridad completas (regla dura de secuencia, vínculo cuenta-dispositivo, verificación de llegada por GPS del celular, tiempo mínimo de viaje configurable, cadena de predecesores, escape de 3 vías, botón de alerta), manifiestos (apertura, pasajeros, cierre, manifiesto vacío con respaldo en papel + pendiente de digitalizar, corrección con versión y auditoría), viajes y reubicaciones (propuesta → autorización → aceptación por unidad → traslado → compensación registrada en auditoría).
2.1 ✅ **Frontend conectado al motor real — Colas, Manifiestos, Viajes** (agosto 2026): `src/lib/operacion-api.ts` es la capa de cliente real (fetch + JWT + adaptadores a los tipos del frontend). Ya consumen el backend real en vez de `demo.ts`: pantalla de Colas (admin) — con inscripción manual de unidad, confirmación de llegada por GPS del navegador, avanzar cadena, salió a viaje, escape de 3 vías; pantalla de Manifiestos (admin) — listado real, mapa de asientos real por tipo de vehículo para agregar pasajeros, corrección con nueva versión; pantalla de Viajes (admin) — listado real; y del lado del conductor en la app (`DriverApp.tsx`) — Cola (inscribirse, confirmar llegada por GPS, "me inscribo más tarde", posición operativa con color igual que el admin), Manifiesto (abrir/agregar pasajeros con mapa de asientos real/cerrar/completar pendientes de papel), e Inicio (estado real de cola/viaje, terminal actual inferido — §3.11 de `plan-operacion.md`). La lógica de "posición operativa" (LLAMANDO/RAMPA/EXTERIOR con color) vive compartida en `src/lib/queue-ui.ts` entre admin y conductor. Cola, Manifiesto e Inicio del conductor se refrescan solos cada 15s. Sigue en `demo.ts` a propósito, por decisión explícita (no tocar sin pedirlo de nuevo): Flota, Personas, Empresas, Reportes, Auditoría, todo lo de GPS, Configuración, Kiosco de terminal, Centro de operaciones, App de socio, y SuperAdmin — además de Perfil y Mis viajes del conductor.
   - Nota técnica importante: para que el flujo de cola del conductor pueda encontrar "su" vehículo, el seed ahora también rellena `Person.code`/`company`/`linkedUnit` del conductor al asignarlo a su unidad (antes quedaba vacío). Si la base de datos ya tenía datos sembrados de antes de este cambio, hay que volver a correr `npx prisma db seed` en `backend/` para que se rellene ese dato en los conductores existentes.
3. **Después:** asistente conversacional (Claude), WhatsApp Business, integración real con Traccar (PRO y GPS Vehicular), avisos, recaudación por empresa.

## 5. Pendientes de decidir

- ¿El bot de WhatsApp aplica solo a asociaciones con PRO, o también hay una versión básica para Operación (solo cola general/turno, sin GPS ni recaudación)? (`plan-pro.md` §8)
- Dónde vivirá el código del backend: ¿carpeta nueva dentro de `Plataforma web - chaski ai`, o un proyecto/repositorio separado al lado?
- Hosting de producción para PostgreSQL: ¿VPS propio de DigitalOcean (junto con Traccar) o un servicio administrado?
- Pérdida de señal GPS al inscribirse en cola (unidades PRO) — ver `plan-pro.md` §3 (la inscripción 100% automática por geocerca ya se descartó el 4 de septiembre de 2026: el conductor siempre decide, el hardware solo reemplaza al celular como fuente de GPS).
