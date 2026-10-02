# Infraestructura y despliegue — dónde vive CHASKI RUTA y por qué

Este documento explica, en un solo lugar, dónde está alojado cada parte de
la plataforma, por qué se eligió ese proveedor, y cómo entrar a ver/gestionar
cada pieza. Complementa a `planes/arquitectura-tecnica.md` (que describe el
stack técnico) — aquí va específicamente el "dónde" y el "por qué ahí".

**Corrección importante (23 de septiembre – 2 de octubre de 2026):** el
backend y la base de datos vivían en Google Cloud (Cloud Run + Cloud SQL).
Se migraron por completo a **Railway**, y los recursos de Google Cloud se
borraron en su totalidad. Cualquier versión anterior de este documento que
describa Cloud Run/Cloud SQL como el estado actual quedó obsoleta — ver §2
para el motivo del cambio.

## 1. Resumen — qué vive dónde

| Parte | Proveedor | Nombre real |
|---|---|---|
| Frontend (React + Vite) | Vercel | proyecto `chaski-ruta`, team `chaski-ruta-pe` |
| Backend (NestJS) | **Railway** | servicio `chaski-ruta` (conectado al repo `rudyjayde/chaski-ruta`, carpeta raíz `backend`), proyecto Railway `chaski-ruta` |
| Base de datos (PostgreSQL) | **Railway** | servicio `Postgres`, mismo proyecto Railway |
| Secretos (contraseñas, API keys) | Variables de entorno de Railway | por servicio, en la pestaña "Variables" |
| Despliegue automático del backend | Railway (integración con GitHub) | push a `main` que toque `backend/` despliega solo |
| Correo transaccional | Resend | dominio verificado `chaskiai.com.pe` |
| Imágenes (logos, fotos de flota) | Cloudinary | cuenta `sgf8nwgk` |
| GPS/telemetría | Traccar | VPS de DigitalOcean, servidor externo (sin cambios) |
| Dominio | Punto.pe | `chaskiai.com.pe`, a nombre de Import Star Peruvian EIRL |
| Monitoreo externo (si la API responde) | Google Cloud Monitoring | cuenta `chaskiai7@gmail.com`, proyecto `chaski-ruta` — es lo único que se dejó en Google, ver §7 |

## 2. Por qué se migró de Google Cloud a Railway (2 de octubre de 2026)

**Antecedente:** el 20 de septiembre de 2026 se desplegó en Google Cloud
Run + Cloud SQL (región `southamerica-west1`, Chile) por cercanía real a
Perú y control de infraestructura de nivel empresarial, aceptando a cambio
mayor costo y complejidad de operar.

**Lo que cambió la decisión:** con datos reales de facturación (no
estimados), el costo de Google Cloud resultó ser un **costo fijo alto
incluso con uso casi nulo** (2 vehículos de prueba, pocas consultas):

| Pieza | Costo real aproximado al mes | ¿Depende del uso? |
|---|---|---|
| Balanceador de carga (HTTPS Load Balancer, necesario para el dominio propio) | US$ 18–25 | No, fijo |
| Base de datos (Cloud SQL, instancia más chica disponible) | US$ 25–30 | Casi nada |
| Backend (Cloud Run) | US$ 5–10 | Un poco |
| **Total real verificado** (factura de septiembre 2026) | **S/ 118.76** | — |

Ese monto no bajaba aunque el uso fuera mínimo, porque Cloud SQL y el
balanceador cobran por tener el recurso encendido, no por consulta.

**Decisión (Jayde, 2 de octubre de 2026):** migrar a Railway, que cobra
por uso real (CPU/memoria efectivamente consumidos, sin un balanceador
obligatorio de por medio). Se acepta conscientemente el mismo costo
oculto que antes se evitó a propósito: **Railway no tiene región en
Sudamérica** — sus regiones son EE.UU. (California, Virginia), Ámsterdam
y Singapur. El servidor quedó en EE.UU., más lejos de Perú que Chile.

**Por qué se acepta esa pérdida de cercanía ahora:** la operación sigue en
etapa de piloto (sin contrato firmado, pocos vehículos reales), así que el
costo predecible y bajo pesa más que la latencia extra en esta etapa. Si
la escala crece mucho (muchas asociaciones, uso constante), vale la pena
reevaluar volver a un proveedor con presencia en Sudamérica — queda como
nota para revisar más adelante, no una decisión cerrada para siempre.

## 3. Backend — Railway

**Qué es:** un servicio que construye el `Dockerfile` de `backend/` y
corre el contenedor resultante.

**Configuración real de hoy:**
- Conectado al repositorio `rudyjayde/chaski-ruta`, rama `main`, con
  **Root Directory = `backend`** (el monorepo tiene la web en la raíz y el
  backend en esa carpeta — Railway solo construye esa parte).
- Despliegue automático: cada push a `main` que toque `backend/` dispara
  sola una construcción y despliegue nuevo.
- Variables de entorno: las mismas que usaba Cloud Run (claves de Google
  OAuth, Cloudinary, Anthropic, Traccar, Resend, JWT), cargadas a mano una
  vez durante la migración — las secretas se copiaron directamente desde
  Google Secret Manager al panel de Railway, nunca pasaron por un archivo
  ni por un chat.
- `DATABASE_URL` usa la referencia nativa de Railway a la base del mismo
  proyecto (`${{Postgres.DATABASE_URL}}`), por red privada — nunca sale a
  Internet.

**Cómo verlo:** [railway.com](https://railway.com), proyecto `chaski-ruta`
(cuenta de GitHub `rudyjayde`) → servicio `chaski-ruta` → pestañas
Deployments (logs en vivo), Variables, Metrics.

## 4. Base de datos — Railway Postgres

**Qué es:** PostgreSQL corriendo como servicio dentro del mismo proyecto
Railway, con un volumen persistente propio (`postgres-volume`).

**Cómo se migraron los datos (23 de septiembre de 2026):** se copiaron
tabla por tabla desde Cloud SQL, y se verificó fila por fila que el
número de registros coincidiera exactamente en las dos bases antes de
cortar el tráfico real hacia Railway. La única tabla que no se copió fue
`health_check_logs` (historial técnico interno, se regenera solo).

**Backups:** Railway tiene una pestaña "Backups" en el servicio Postgres.
**Pendiente de verificar a fondo** — a diferencia de Cloud SQL, no se hizo
todavía una prueba real de restaurar un backup de Railway a una base
nueva (sí se hizo esa prueba completa con Cloud SQL, el 20 de septiembre).
Conviene hacerla antes de confiar en que el respaldo automático de
Railway funciona igual de bien.

**Cómo verla:** Railway → proyecto `chaski-ruta` → servicio `Postgres` →
pestañas Data (ver filas), Backups, Variables.

**Acceso externo (solo para tareas puntuales, no dejar activo):** el
servicio no expone un puerto público por defecto. Si hace falta conectar
un cliente externo (pgAdmin, un script de migración), hay que activar
"Public Networking" en Settings → Networking del servicio Postgres,
usarlo, y **desactivarlo de nuevo al terminar** — mientras está activo,
cualquiera con la cadena de conexión puede entrar.

## 5. Frontend — Vercel

Sin cambios respecto a antes de la migración.

**Por qué se mantiene en Vercel:** el frontend es un sitio estático (React
compilado a HTML/JS/CSS) — no importa la cercanía geográfica del servidor,
porque Vercel sirve los archivos ya compilados desde una red global de CDN.

**Cómo verlo:** [vercel.com/chaski-ruta-pe/chaski-ruta](https://vercel.com/chaski-ruta-pe/chaski-ruta)

**Nota operativa:** el despliegue automático por push a GitHub no está
conectado para el frontend — cada actualización se sube manualmente por
línea de comandos (`vercel --prod`) cuando se termina un cambio.

## 6. Dominio y correo

- **Dominio** (`chaskiai.com.pe`): comprado en Punto.pe, a nombre de
  Import Star Peruvian EIRL. Los registros DNS apuntan:
  - `chaskiai.com.pe` / `www.chaskiai.com.pe` → Vercel (frontend, sin
    cambios)
  - `api.chaskiai.com.pe` → **CNAME a Railway** (antes era un registro A a
    la IP del balanceador de Google, se reemplazó el 2 de octubre de
    2026). Railway emite y renueva el certificado HTTPS solo.
- **Correo transaccional** (bienvenida, recuperar contraseña, tickets de
  soporte): Resend, con el dominio `chaskiai.com.pe` verificado por DNS
  (SPF/DKIM/DMARC). Sin cambios.

## 7. Qué quedó (a propósito) en Google Cloud

Todo lo que costaba dinero se borró (Cloud Run, Cloud SQL, el balanceador,
las claves en Secret Manager, el repositorio de imágenes Docker). Lo único
que se dejó activo, porque es **gratis** y sigue siendo útil sin importar
dónde viva el backend:

- **Una alerta de presupuesto** (~S/ 75 al mes) sobre la cuenta de
  facturación, por si algo en Google Cloud vuelve a generar costo.
- **Un chequeo de disponibilidad** que visita
  `https://api.chaskiai.com.pe/landing-content` cada minuto — sigue
  funcionando igual, porque solo hace una petición HTTP normal a la
  dirección pública, sin importar que ahora responda Railway y no Google.
- **5 alertas por correo** a `importstarperuvian@gmail.com`: de esas, la
  de "API caída" (basada en el chequeo de arriba) sigue siendo útil. Las
  otras 4 (errores 5xx de Cloud Run, CPU/disco de Cloud SQL, base de
  datos apagada) **quedaron mirando recursos que ya no existen** — nunca
  se van a disparar, pero tampoco cuestan nada ni hacen daño dejarlas.
  Pendiente de limpieza cuando se tenga tiempo, no urgente.

**El proyecto de Google Cloud (`chaski-ruta`) sigue existiendo**, solo que
vacío de recursos pagados. La cuenta de facturación de Google (tarjeta
Visa terminada en 6542) quedó con una factura real de septiembre
(S/ 118.76) pendiente de resolverse aparte — ver conversación de soporte,
no es un tema de este documento técnico.

## 8. Resumen de la decisión, en una frase

Se priorizó **costo predecible y bajo mientras la operación sigue en
etapa de piloto sin contrato firmado**, aceptando conscientemente perder
la cercanía física a Perú que tenía Google Cloud en Chile — una
compensación que vale la pena revisar otra vez si la escala del negocio
cambia.
