# Plataformas: web y aplicación nativa

**Fecha de esta versión:** 8 de septiembre de 2026. Complementa al
`DOCUMENTO_MAESTRO_NEGOCIO_Y_PRODUCTO.md` — ante cualquier duda, manda el
maestro. Este documento existe porque la documentación anterior confundía
"web responsive" con "diseño de app móvil" y planteaba la app como un
envoltorio Capacitor de la web. Esa decisión fue eliminada el 4-8 de
septiembre de 2026.

## 1. Propósito

CHASKI RUTA se construye sobre cuatro superficies distintas que comparten un
mismo backend. Confundirlas produce pantallas de escritorio que parecen apps
de celular, o funciones nativas que nadie sabe si ya existen. Este documento
fija la separación.

```text
Landing pública  ──┐
Plataforma web   ──┼── Backend compartido (NestJS + Prisma + PostgreSQL) ── un solo tenant por asociacion
App nativa       ──┘
```

- **Landing pública:** sitio responsive, cualquier navegador, capta
  solicitudes comerciales. No crea cuentas ni asociaciones. Detalle completo
  en `landing-publica-y-solicitudes-comerciales.md`.
- **Plataforma web (este repositorio, React + Vite):** desktop-first. Super
  Admin y administración completa de la asociación.
- **Aplicación nativa (nueva, sin construir todavía):** proyecto
  independiente en Flutter. CONDUCTOR, SOCIO y ADMINISTRADOR — nunca
  SUPERADMIN.
- **Backend compartido:** NestJS + Prisma + PostgreSQL. Ninguna regla de
  negocio vive solo en un frontend; ni la web ni la app la duplican por su
  cuenta.

## 2. Usuarios por plataforma

### Super Admin de CHASKI AI

Solo plataforma web. No opera el día a día de las colas de ninguna
asociación.

- Crear asociaciones y su administrador inicial.
- Configurar plan, terminales y rutas.
- Gestionar solicitudes comerciales y pagos.
- Gestionar GPS e instalaciones.
- Administrar la landing.
- Supervisar salud técnica, soporte y auditoría global.

### Administrador de asociación

**Web:** configuración completa, personas, empresas, vehículos, reportes
extensos, auditoría, correcciones y configuraciones.

**App nativa** (una vez construida): herramienta de respuesta rápida, no de
administración completa —

- Consultar ambas colas y ver quién está LLAMANDO.
- Recibir y resolver solicitudes de INSCRIPCIÓN RETRASADA.
- Autorizar reubicaciones y seleccionar vehículos manualmente.
- Atender incidentes y excepciones (accidente, robo, celular perdido).
- Autorizar cambio o revinculación de dispositivo.
- Consultar viajes y manifiestos recientes.
- Recibir notificaciones.
- Consultar GPS de flota cuando el plan lo permite.

### Socio

App nativa y portal web según corresponda.

- **Con Operación:** sus vehículos, conductor asignado, vueltas, viajes y
  reportes básicos permitidos.
- **Con PRO:** ubicación, velocidad, movimiento, ignición, última señal,
  historial de recorridos, paradas, kilómetros y alertas autorizadas de sus
  unidades incluidas.
- **Con GPS Vehicular individual:** puede consultar el GPS de su propia
  unidad aunque la asociación siga en Operación. Esto **no** le da al
  administrador de la asociación supervisión GPS centralizada. El conductor
  asignado puede recibir acceso operativo limitado mientras su asignación
  esté vigente.

### Conductor

La app nativa es su canal principal una vez construida:

- Ver terminal actual e inscribirse en la cola.
- Consultar posición y ver quién está LLAMANDO.
- Abrir el manifiesto cuando está LLAMANDO; registrar pasajeros y asientos;
  guardar y descargar el manifiesto.
- Marcar salida y ver el contador de 60 minutos (nunca como ETA).
- Inscribirse en la cola de retorno; presionar NO SALDRÉ AHORA; solicitar
  INSCRIPCIÓN RETRASADA.
- Recibir notificaciones.
- Acceder a funciones GPS limitadas si su unidad tiene GPS y su asignación lo
  permite.

## 3. Tecnología móvil: decidida, pendiente de construir

**Decisión (8 de septiembre de 2026): la aplicación nativa se construye en
Flutter.** `DISEÑO APROBADO, PENDIENTE DE IMPLEMENTAR` — no existe ni una
línea de código de este proyecto todavía.

**Orden de construcción acordado:** primero se termina y consolida el
sistema web (plataforma + backend + las funciones de IA aplicadas al negocio
— ver `ia-aplicada.md`). La app en Flutter se construye **al final**, no en
paralelo. Motivo: es un proyecto de frontend completamente nuevo, y el valor
inmediato de CHASKI RUTA hoy está en cerrar bien el sistema web y las reglas
de negocio antes de duplicar esfuerzo en una segunda interfaz.

Sigue pendiente de decidir, y no debe inventarse:

- Arquitectura de navegación dentro de la app.
- Estrategia offline (qué funciona sin conexión en zonas sin señal).
- Proveedor de notificaciones push.
- Manejo de actualización obligatoria de versión.
- Distribución interna de pruebas (beta cerrada, testers).
- Fecha de publicación en Google Play y, después, en App Store.

## 4. Capacidades nativas futuras

Se listan como necesidades funcionales que la app deberá cubrir — **no**
como algo ya construido:

- GPS puntual del celular y permisos de ubicación.
- Cámara y lectura de QR.
- Notificaciones push.
- Almacenamiento seguro de sesión.
- Vinculación y revocación de dispositivo.
- Acceso biométrico — solo como `PENDIENTE DE DECISIÓN`, no aprobado aún.
- Cuando la unidad tenga hardware GPS (PRO o GPS Vehicular), la app consulta
  esa posición **a través del backend**; nunca se conecta directo a Traccar
  sin pasar por el control de permisos de CHASKI RUTA.

## 5. Estado real

- La aplicación nativa **todavía no está construida**. `PENDIENTE DE
  IMPLEMENTAR`.
- Las pantallas web actuales de conductor, socio y administrador (React +
  Vite) no demuestran que la app nativa exista — son la plataforma web, y
  varias siguen usando datos de `demo.ts` en vez del backend real (ver
  `arquitectura-tecnica.md` §4 para el detalle exacto de qué está
  conectado de verdad).
- Las APIs reales del backend (auth, colas, manifiestos, viajes,
  reubicaciones) sí podrán reutilizarse desde la app cuando se construya —
  son las mismas para web y nativa.
- Todo lo que hoy sigue en `demo.ts` debe migrarse al backend real antes de
  poder compartirse con la app nativa.
