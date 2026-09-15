# Infraestructura y despliegue — dónde vive CHASKI RUTA y por qué

Este documento explica, en un solo lugar, dónde está alojado cada parte de
la plataforma, por qué se eligió ese proveedor y no otro (Railway, que es
lo que Jayde usaba en proyectos anteriores), y cómo entrar a ver/gestionar
cada pieza. Complementa a `planes/arquitectura-tecnica.md` (que describe el
stack técnico) — aquí va específicamente el "dónde" y el "por qué ahí".

## 1. Resumen — qué vive dónde

| Parte | Proveedor | Nombre real |
|---|---|---|
| Frontend (React + Vite) | Vercel | proyecto `chaski-ruta`, team `chaski-ruta-pe` |
| Backend (NestJS) | Google Cloud Run | servicio `chaski-backend`, región `southamerica-west1` (Santiago de Chile) |
| Base de datos (PostgreSQL) | Google Cloud SQL | instancia `chaski-db`, misma región |
| Secretos (contraseñas, API keys) | Google Secret Manager | mismo proyecto (`chaski-ruta`) |
| Despliegue automático del backend | Google Cloud Build | disparado por push a GitHub |
| Correo transaccional | Resend | dominio verificado `chaskiai.com.pe` |
| Imágenes (logos, fotos de flota) | Cloudinary | cuenta `sgf8nwgk` |
| GPS/telemetría | Traccar | VPS de DigitalOcean, servidor externo ya existente |
| Dominio | Punto.pe | `chaskiai.com.pe`, a nombre de Import Star Peruvian EIRL |

## 2. Por qué no se usó Railway (como en otros proyectos)

Railway es rápido de configurar y tiene un dashboard muy amigable (un solo
lugar para ver backend, base de datos y variables). Pero para CHASKI RUTA
se decidió **Google Cloud** por una razón explícita de negocio, dicha por
Jayde antes de empezar el despliegue:

> "Esta plataforma no tiene derecho a fallar, debe ser óptima respecto a
> base de datos, etc. Tiene que ocupar servidores cerca a Perú para que no
> sea lento."

Dos consecuencias directas de esa frase:

- **Cercanía real a Perú.** Los servidores de Google Cloud en
  `southamerica-west1` están físicamente en Chile — la región disponible
  de Google más cercana a Perú. Railway no tiene una región en Sudamérica;
  su servidor más cercano queda en EE.UU., lo que añade latencia real a
  cada acción de un conductor inscribiéndose en cola o de un administrador
  cargando un reporte.
- **Infraestructura de nivel empresarial.** Google Cloud da control fino
  sobre backups, recuperación ante desastres, aislamiento por región,
  escalado y seguridad (Secret Manager, IAM) — más profundo que lo que
  ofrece un PaaS pensado para velocidad de desarrollo como Railway. Para
  un proyecto con datos reales de transporte de pasajeros, se priorizó esa
  robustez sobre la comodidad del dashboard único.

**El costo de esa decisión:** Google Cloud es más difícil de operar — no
hay un solo dashboard bonito, la configuración se hace por consola web
repartida en varias secciones o por línea de comandos (`gcloud`). Es una
compensación consciente: más control y más cercanía, a cambio de menos
comodidad visual.

## 3. Backend — Google Cloud Run

**Qué es:** un servicio que corre el contenedor Docker del backend NestJS,
escalando automáticamente según el tráfico.

**Por qué Cloud Run y no una VM tradicional:** no hay que administrar
ningún servidor (parches, reinicios, actualizaciones de sistema operativo)
— Google se encarga de eso. Solo se sube una imagen Docker y Cloud Run la
corre.

**Configuración real de hoy:**
- `min-instances=1`: siempre hay al menos una instancia viva — evita el
  "cold start" (varios segundos de espera) que tendría la configuración
  por defecto (0 instancias en reposo).
- `max-instances=3`: tope de crecimiento automático si sube el tráfico.
- Conectado a Cloud SQL por el conector nativo de Cloud Run (sin exponer
  la base de datos a Internet).
- Dominio propio (`api.chaskiai.com.pe`) mapeado a través de un **Global
  HTTPS Load Balancer** — Cloud Run no soporta mapeo de dominio propio de
  forma nativa en la región `southamerica-west1` todavía, así que se
  construyó ese balanceador como solución (NEG serverless + certificado
  administrado + IP estática).

**Cómo verlo:** [console.cloud.google.com/run](https://console.cloud.google.com/run?project=chaski-ruta)
→ `chaski-backend` — ahí se ven logs en vivo, revisiones desplegadas,
métricas de tráfico/errores y las variables de entorno actuales.

## 4. Base de datos — Google Cloud SQL (PostgreSQL)

**Qué es:** PostgreSQL completamente administrado por Google — no es un
Postgres corriendo en un VPS que haya que mantener.

**Por qué Cloud SQL y no auto-alojarlo:** backups automáticos diarios y
recuperación a un punto en el tiempo ya vienen incluidos sin configurar
nada aparte; mantenerlo en la misma región que el backend (`southamerica-west1`)
da la latencia más baja posible entre ambos.

**Configuración real de hoy:**
- Instancia `chaski-db`, tamaño `db-g1-small` (nivel compartido — apropiado
  para 1-2 vehículos en piloto real, no para escala grande todavía).
- **Sin Alta Disponibilidad (zona única, no 3 réplicas)** — decisión
  explícita tomada con Jayde al ver el costo de HA frente al tamaño real
  del piloto actual. Activar HA es un cambio de configuración conocido
  para cuando la escala lo justifique, no algo que requiera reconstruir
  nada.
- Backup diario automático a las 07:00, más recuperación a un punto en el
  tiempo con 7 días de ventana (verificado en vivo el 15 de septiembre de 2026).

**Cómo verla:** [console.cloud.google.com/sql](https://console.cloud.google.com/sql/instances?project=chaski-ruta)
→ `chaski-db`. A diferencia de Railway, **no hay un editor de tablas visual
integrado** — para ver filas reales hace falta un cliente Postgres (pgAdmin,
DBeaver, TablePlus) conectado por el **Cloud SQL Auth Proxy** (un túnel que
permite conectarse desde una computadora local sin exponer la base de datos
a Internet), o pedirle a Claude que consulte algo puntual por ese mismo túnel.

## 5. Frontend — Vercel

**Por qué se mantuvo en Vercel (a diferencia del backend):** el frontend es
un sitio estático (React compilado a HTML/JS/CSS) — no importa la
cercanía geográfica del servidor de build, porque Vercel sirve los
archivos ya compilados desde una red global de CDN (el archivo llega desde
el punto más cercano al visitante, sea cual sea). Cambiarlo a Google Cloud
no habría dado ninguna ventaja real, y Vercel es la herramienta que Jayde
ya domina de otros proyectos.

**Cómo verlo:** [vercel.com/chaski-ruta-pe/chaski-ruta](https://vercel.com/chaski-ruta-pe/chaski-ruta)

**Nota operativa importante:** el despliegue automático por push a GitHub
**no quedó conectado** para el frontend (un intento falló por permisos del
repositorio) — hoy cada actualización del frontend se sube manualmente
por línea de comandos (`vercel --prod`) cuando se termina un cambio.
El backend sí tiene despliegue 100% automático (ver sección 6).

## 6. Despliegue automático — Google Cloud Build

Cada `git push` a la rama `main` que modifique algo dentro de `backend/`
dispara sola una construcción y despliegue nuevo del backend — sin que
haya que ejecutar ningún comando manual. Es el equivalente exacto al
auto-deploy de Railway, solo que en Google Cloud.

**Cómo funciona:** Cloud Build está conectado directo al repositorio de
GitHub (`rudyjayde/chaski-ruta`). El archivo `backend/cloudbuild.yaml`
define los pasos: construir la imagen Docker, subirla, y desplegarla a
Cloud Run con los mismos parámetros que el primer despliegue manual.

**Cómo verlo:** [console.cloud.google.com/cloud-build/builds](https://console.cloud.google.com/cloud-build/builds?project=chaski-ruta)
— cada build corresponde a un push real, con su log completo si algo falla.

## 7. Dominio y correo

- **Dominio** (`chaskiai.com.pe`): comprado en Punto.pe, a nombre de
  Import Star Peruvian EIRL. Los registros DNS ahí apuntan:
  - `chaskiai.com.pe` / `www.chaskiai.com.pe` → Vercel (frontend)
  - `api.chaskiai.com.pe` → el Load Balancer de Google (backend)
- **Correo transaccional** (bienvenida, recuperar contraseña, tickets de
  soporte): Resend, con el dominio `chaskiai.com.pe` verificado por DNS
  (SPF/DKIM/DMARC) para poder enviar a cualquier destinatario real, no
  solo a la cuenta dueña de la API key.

## 8. Resumen de la decisión, en una frase

Se priorizó **cercanía real a Perú y control de infraestructura** sobre
**comodidad de un dashboard único** — Google Cloud para todo lo que toca
datos reales de pasajeros y operación (backend + base de datos), y se
mantuvo Vercel solo donde la cercanía geográfica del servidor no aporta
ninguna ventaja real (el frontend estático).
