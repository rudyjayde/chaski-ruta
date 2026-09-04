# Documentación CHASKI RUTA — por plan

Esta carpeta organiza la documentación de negocio y producto por plan comercial, para no tener que buscar todo dentro del Documento Maestro completo.

- `DOCUMENTO_MAESTRO_NEGOCIO_Y_PRODUCTO.md` — documento maestro completo (fuente de verdad funcional). Los tres archivos de abajo son un desglose de este documento, no un reemplazo: ante cualquier duda o contradicción, manda el maestro.
- `plan-operacion.md` — Plan Operación: qué incluye, y el diseño completo de integridad de cola/manifiesto/antifraude que se definió en conversación con CHASKI AI (verificación de llegada, cadena de predecesores, escape de 3 vías, manejo de manifiesto vacío, reubicaciones).
- `plan-pro.md` — Plan PRO: qué agrega sobre Operación, el diseño de inscripción automática en cola por GPS físico, y qué falta construir de verdad en el código (vs. lo que hoy es solo UI de prototipo).
- `plan-gps-vehicular.md` — GPS Vehicular por unidad: el complemento que un socio puede comprar aunque la asociación se quede en Operación, el flujo técnico de instalación (Teltonika → Traccar), y notas de estrategia comercial.
- `plan-flujo-colas-hardware.md` — el flujo real de "Marcar salida" / "Inscribirme" en la cola (igual para Operación y PRO, solo cambia la fuente del GPS al inscribirse de vuelta; no existe botón separado de "Marcar llegada" ni timeout automático — corregido 4 de septiembre de 2026) y el candado duro de orden real de salida entre unidades al re-inscribirse en la cola de regreso.
- `arquitectura-tecnica.md` — el "cómo se construye": stack (React/Vite + NestJS/Prisma/PostgreSQL + Capacitor), dominio y correo (ChaskiAI.com.pe + Google Workspace), plan de despliegue, y el orden de prioridad para construir el backend real.

Última actualización: 31 de agosto de 2026, a partir de la conversación de diseño de producto con Jayde (CHASKI AI).

Puntos que el documento maestro marca explícitamente como pendientes y que **no deben inventarse** en ninguno de estos archivos (precios, SLA, fórmulas de compensación, etc.) están listados en la sección 13 del documento maestro y se referencian donde corresponde.
