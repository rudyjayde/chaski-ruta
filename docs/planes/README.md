# Documentación CHASKI RUTA — por plan

Esta carpeta organiza la documentación de negocio y producto por plan comercial, para no tener que buscar todo dentro del Documento Maestro completo.

**Jerarquía (actualizada 8 de septiembre de 2026):**

1. `DOCUMENTO_MAESTRO_NEGOCIO_Y_PRODUCTO.md` — documento maestro, fuente funcional principal. Ante cualquier duda o contradicción, manda este documento.
2. Documentos específicos por dominio — el desglose legible de partes del maestro: `plan-operacion.md`, `plan-pro.md`, `plan-gps-vehicular.md`, `plan-flujo-colas-hardware.md`, `plataformas-web-y-app-nativa.md`, `landing-publica-y-solicitudes-comerciales.md`, `ia-aplicada.md`.
3. `arquitectura-tecnica.md` — implementación y estado real del "cómo se construye".
4. `FLUJO_NEGOCIO_ACTUAL.md` — resumen único de lo observado realmente en código, no un documento de reglas aparte.
5. `CLAUDE.md` (raíz del proyecto) — reglas permanentes de trabajo para agentes (Claude Code y otros).

**Ante una contradicción:** las decisiones aprobadas más recientes sustituyen la documentación antigua. El código no se considera correcto únicamente por existir — toda brecha entre lo que el código hace y la regla vigente debe señalarse (`BRECHA ENTRE CÓDIGO Y REGLA ACTUAL — REQUIERE AUDITORÍA Y CORRECCIÓN`) antes de modificarla.

## Los documentos

- `DOCUMENTO_MAESTRO_NEGOCIO_Y_PRODUCTO.md` — documento maestro completo (fuente de verdad funcional).
- `plan-operacion.md` — Plan Operación: qué incluye, y el diseño completo de integridad de cola/manifiesto/antifraude.
- `plan-pro.md` — Plan PRO: qué agrega sobre Operación, el diseño de inscripción por GPS físico, las 4 propuestas de mejora (§11), y qué falta construir de verdad en el código.
- `plan-gps-vehicular.md` — GPS Vehicular por unidad: el complemento que un socio puede comprar aunque la asociación se quede en Operación.
- `plan-flujo-colas-hardware.md` — el flujo real de "Marcar salida" / "Inscribirme" en la cola (igual para Operación y PRO), y el candado duro de orden real de salida.
- `plataformas-web-y-app-nativa.md` — la separación entre landing pública, plataforma web y aplicación nativa (Flutter, decidido, pendiente de construir al final del roadmap), usuarios por plataforma y backend compartido.
- `landing-publica-y-solicitudes-comerciales.md` — la landing administrable, el formulario comercial dinámico, y el flujo de una Solicitud comercial hasta convertirse en asociación real.
- `ia-aplicada.md` — funciones de IA transversales al negocio y las 4 propuestas de diferenciación estratégica (empezando por detección automática de accidentes).
- `arquitectura-tecnica.md` — el "cómo se construye": stack (React 19 + Vite 8 + NestJS/Prisma/PostgreSQL; app nativa en Flutter, sin Capacitor), dominio y correo, plan de despliegue, y el orden de prioridad para construir el backend real y, al final, la app nativa.
- `FLUJO_NEGOCIO_ACTUAL.md` — el resumen único y legible del flujo de negocio corregido, con lo que ya está construido y lo que falta ajustar en el código.

Última actualización: 8 de septiembre de 2026, sobre la conversación de producto con Jayde (CHASKI AI): separación web/app nativa, landing administrable, formularios comerciales, IA aplicada al negocio.

Puntos que el documento maestro marca explícitamente como pendientes y que **no deben inventarse** en ninguno de estos archivos (precios, SLA, fórmulas de compensación, etc.) están listados en la sección 13 del documento maestro y se referencian donde corresponde.
