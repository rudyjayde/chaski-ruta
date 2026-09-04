# Plan PRO

Fuente: Documento Maestro §7.2, §7.2.1 (agregada en esta conversación), §7.4. PRO se activa para **toda la asociación**, no por unidad — para eso existe el complemento GPS Vehicular (ver `plan-gps-vehicular.md`).

## 1. Qué es

PRO = todo Plan Operación, **más** una capa de hardware y visibilidad continua para toda la flota de la asociación. No reemplaza nada del flujo de Operación: la cola, el manifiesto, las reglas de secuencia y reubicaciones funcionan exactamente igual.

Se activa después de solicitud, cotización, pago verificado y configuración del Super Admin. El administrador puede "Solicitar PRO", pero solo el Super Admin de CHASKI AI verifica el pago, asigna dispositivos y activa el alcance.

## 2. Qué agrega sobre Operación (§7.2)

- GPS físico para las unidades incluidas en el contrato (hardware Teltonika).
- Mapa de flota en vivo.
- Última posición válida y estado de señal.
- Historial de recorridos, paradas y kilometraje.
- Geocercas de terminales y zonas operativas.
- Alertas de desconexión, energía, ignición, velocidad y entrada/salida de geocerca según configuración.
- Estado técnico de dispositivos y SIM.
- Reportes avanzados de flota y recorridos.
- Herramientas de supervisión para el gerente.
- Soporte GPS y mantenimiento según contrato.

**Principio importante:** PRO no genera sanciones automáticas basadas únicamente en GPS. Una alerta es evidencia para revisión, no una condena automática — mismo criterio que ya se usa en Operación (nunca castigar solo con una señal débil).

## 3. La cola en unidades PRO: el hardware reemplaza al celular, nunca a la decisión del conductor (§7.2.1)

Las verificaciones de llegada de Operación (vínculo cuenta-dispositivo, chequeo puntual de GPS del celular, tiempo mínimo de viaje, cadena de predecesores) son un sustituto de una fuente de verdad física que Operación no tiene. Una unidad con GPS físico activo bajo PRO ya no necesita ese sustituto: el servidor conoce la posición real del vehículo en todo momento.

**Corrección (4 de septiembre de 2026):** se descarta la inscripción 100% automática por geocerca. El hardware **reemplaza al GPS del celular como fuente de verdad de ubicación**, pero el conductor sigue siendo quien decide presionar "Inscribirme" o "No saldré ahora" — igual que en Operación (`plan-flujo-colas-hardware.md` §1 y §2). Entrar a la geocerca de la terminal no inscribe solo al vehículo.

Para unidades con GPS físico activo:

- Al presionar "Inscribirme", la condición de GPS de terminal (`plan-operacion.md` §3.3) se valida con la posición real del vehículo leída de Traccar, en vez de con el celular — el resto del flujo (los 60 minutos, la cadena de predecesores) es idéntico a Operación.
- Como el dispositivo se vincula por IMEI al **vehículo**, nunca a una cuenta o conductor, esa validación deja de depender de qué cuenta esté activa. Esto cierra estructuralmente el vector de fraude por cuentas o dispositivos compartidos: ninguna cuenta puede sustituir la presencia física real del vehículo.
- La regla dura de secuencia (no puede entrar a la cola contraria con viaje activo) sigue exactamente igual — se verifica con datos de posición reales en vez de con un proxy de tiempo mínimo.
- Riesgos residuales, ya no de cuentas sino de hardware: pérdida de señal, y en teoría el traslado físico del dispositivo entre vehículos (mitigado con el registro de IMEI/fotos/responsable en la instalación y detección de patrones de telemetría anómalos).
- Las herramientas manuales de excepción (botón de alerta, intervención del gerente) siguen igual que en Operación para incidentes reales — el GPS físico no las reemplaza.

### Pendiente de decidir (no inventar)

- **Pérdida de señal al inscribirse:** ¿la unidad PRO cae al mecanismo de respaldo de Operación (chequeo por celular), o queda marcada "Sin señal" para intervención manual del gerente?

## 4. Qué cambia realmente vs. Operación (resumen)

| Capacidad | Operación | PRO |
|---|---|---|
| Cola digital y manifiestos | Sí | Sí — sin cambios |
| Viajes y reportes operativos | Sí | Sí — sin cambios |
| Reglas de secuencia / cadena de predecesores / reubicaciones | Sí | Sí — sin cambios |
| GPS físico | No | Flota contratada |
| Mapa en vivo | No | Gerente, con permisos definidos |
| Historial GPS / kilometraje | No | Flota contratada |
| Geocercas y alertas | No | Toda la asociación |

Nada del flujo operativo diario cambia. Lo único que cambia es **cómo se prueba** que un vehículo llegó — de un proxy indirecto (celular, cuenta, tiempo mínimo) a una fuente de verdad física (GPS del vehículo).

## 5. Qué empuja la migración a PRO (opinión de producto, no está en el documento maestro)

Operación resuelve el dolor urgente (el caos de colas). PRO no resuelve un dolor urgente nuevo — profesionaliza y da visibilidad remota continua. Lo que en la práctica empuja a una asociación a pagar PRO:

- Escala: muchas unidades, el gerente ya no puede llamar para saber dónde está cada carro.
- Responsabilidad legal / seguros: necesitan evidencia real de ubicación y velocidad ante un accidente o reclamo.
- Control de kilometraje/combustible/mantenimiento.
- Un dueño que quiere supervisar remotamente sin estar en terminal.

## 6. Asistente conversacional (panel admin)

Decidido en conversación de producto (agosto 2026), pendiente de construir — depende de tener el backend real.

- **Nombre:** dinámico por asociación, con el patrón `{Nombre de la asociación} AI` (ej. "ATIPCAR AI"), calculado automáticamente a partir de `Organization.name` — nunca programado a mano por cliente, para que funcione igual con cualquier asociación nueva sin trabajo extra.
- **Motor:** API de Claude. Responde en lenguaje natural, no robótico — saluda por nombre primero (ej. "Hola Carlos, el vehículo 001, el conductor Rubén, hizo 4 vueltas hoy").
- **Diseño técnico obligatorio:** Claude solo debe "llamar" a consultas reales del sistema (function/tool calling contra datos reales) — nunca debe generar una cifra libremente. Así nunca alucina un dato operativo.
- **Ejemplos de uso (panel admin, alcance amplio — a diferencia del bot de WhatsApp, ver §8):** "¿dónde está el vehículo 001?", "¿cuántas vueltas hizo tal conductor?".
- **Definiciones de negocio para las consultas:** *vuelta* = ida y vuelta completa (Juli→Puno + Puno→Juli); *media vuelta* = un solo tramo.

## 7. Recaudación por Empresa

- **Operación:** recaudación visible solo por código/vehículo individual — cada unidad ve lo suyo, sale directo de sus propios manifiestos.
- **PRO:** recaudación consolidada, agrupada **por empresa miembro** de la asociación (ej. Litoral, Virgen de Fátima, San Francisco de Borja) — vista gerencial de más alto nivel, no solo un vehículo a la vez.
- La estructura de datos para esto ya existe en el código (`COMPANIES` en `demo.ts`, con 5 empresas registradas para ATIPCAR) — no es necesario inventar el modelo, solo construir la agregación real.

## 8. Asistente por WhatsApp Business (conductores, socio-conductores y socios)

Mismo asistente/cerebro que el del panel admin (§6), pero como canal aparte, con alcance mucho más acotado:

- **Requiere WhatsApp Business Platform** (Meta Cloud API, normalmente vía un proveedor como Twilio, 360dialog o Gupshup) — no es la app normal de WhatsApp Business, cobra por conversación y exige verificación de negocio ante Meta.
- **Seguridad — vínculo número↔perfil:** solo responde con datos reales si el número de WhatsApp que escribe coincide con el `phone` ya vinculado a esa persona en el sistema. Si el número no está reconocido, no entrega ningún dato — pide vincularlo con el administrador.
- **Alcance limitado a dos niveles:**
  1. **Cola general de la asociación** (Juli→Puno / Puno→Juli) — información compartida, la misma que ya se ve en pantalla de terminal, no sensible, disponible para cualquier cuenta verificada.
  2. **Datos personales del que pregunta:** mi turno, cuántos carros me faltan (relativo a mi propio código), mis vueltas — incluyendo por rango de fechas, desglosadas por método de pago (efectivo/Yape/Plin) y su suma total.
- **Fuera de ese alcance, el asistente redirige** en vez de responder: algo como "Solo puedo ayudarte con tu cola, tu turno o tu perfil (vueltas, recaudación, GPS de tu unidad)." Nunca contesta temas ajenos — protege el costo por conversación y evita que "alucine" fuera de lo que puede verificar.
- **Es un canal exclusivo de consulta (pull)** — el asistente nunca inicia una conversación por su cuenta. Los avisos del admin van por otro canal (§9), no por WhatsApp.
- **Activable/desactivable por asociación desde Super Admin**, mismo patrón que el mini-mapa del conductor, por control de costo de WhatsApp Business Platform.

**Pendiente de decidir:** ¿este canal de WhatsApp aplica solo a asociaciones con PRO, o también existe una versión básica para Operación (solo cola general/turno, sin nada de GPS ni recaudación)?

## 9. Avisos (panel admin → notificaciones)

- El administrador redacta un aviso desde su panel y lo dirige a un público: conductores, socios, o ambos (posible extensión: filtrar también por empresa miembro o por ruta).
- Se entrega como **notificación dentro de la app/plataforma web** de cada perfil — **no por WhatsApp**. Motivo: WhatsApp Business Platform no permite mensajes de texto libre iniciados por el negocio fuera de plantillas pre-aprobadas por Meta (y esas plantillas, si califican como "marketing", cuestan más y tienen más restricciones) — evitar toda esa fricción manteniendo avisos 100% dentro de la app.

## 10. Brechas conocidas entre el diseño y el código actual (de la auditoría)

- No hay conexión real a Traccar (esperado, es un prototipo de UI).
- La migración "GPS Vehicular → PRO sin doble cobro" (§7.3) hoy es un botón que solo cambia un texto en `SAGPSSubscriptions.tsx`; no hay cálculo de prorrateo, fecha de corte ni registro de ajuste real.
- Los precios de referencia de PRO están hardcodeados en `SuperAdminApp.tsx` (`SABillingConfig`) como si fueran definitivos, cuando el documento maestro los marca como pendientes de definir (§13).
