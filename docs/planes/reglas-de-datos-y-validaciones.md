# Reglas de datos y validaciones — CHASKI RUTA

Fuente única de las reglas que decide el sistema sobre **qué datos acepta**.
Se definieron con Jayde el 19 de septiembre de 2026 (ampliadas el 20 de
septiembre de 2026: ver §1, §4, §11 y §12) y están aplicadas
y probadas tanto en el servidor (la que manda) como en las pantallas (para
avisar antes de enviar).

**Regla de oro:** el servidor es el que decide. Las pantallas repiten la
regla solo para que la persona vea el error al escribir, nunca para
protegerse: cualquier dato que llegue directo al servidor pasa por las
mismas reglas.

**Dónde vive cada regla** (si una cambia, hay que cambiar las dos):

| Qué | Servidor | Pantallas |
|---|---|---|
| Formatos y reglas | `backend/src/common/validators.ts` | `src/lib/validators.ts` |
| Mensajes de error en español | `backend/src/common/validation-messages.ts` (traduce los mensajes por defecto en inglés) | — |
| Forma de cada formulario | `backend/src/*/dto/*.dto.ts` | cada página |

## 1. Identidad de personas

| Dato | Regla | Notas |
|---|---|---|
| **Documento del personal** (administrador, socio, conductor) | **DNI** (exactamente 8 números) o **Carné de extranjería** (9 a 12 letras o números); se elige el tipo en un selector | Sin espacios ni guiones. El pasaporte no aplica al personal. El formato del carné es un supuesto a confirmar |
| **Celular** | Exactamente 9 números | Sin `+51`; si se pega con prefijo, la pantalla lo quita |
| **Licencia de conducir** | 1 letra + 8 números (ej. `Q12345678`) | Solo conductores; única en todo el sistema |
| **Fecha de emisión de la licencia** | No puede ser futura | Nuevo: para saber cuándo toca revalidarla en el MTC |
| **Vencimiento de la licencia** | Posterior a la emisión | — |
| **Categoría de la licencia** | Lista cerrada de la clase A del MTC: **A-I, A-IIa, A-IIb, A-IIIa, A-IIIb, A-IIIc, A-IV** | Se incluyen todas, sin filtrar por pasajeros o carga: si el conductor puede trabajar en la asociación lo decide el administrador. La clase B (motos) no está incluida (a confirmar) |
| **Correo** | Se guarda y se compara **siempre en minúsculas** | Antes `Rosa@Gmail.com` no encontraba a `rosa@gmail.com` y daba error 500 |
| **Nombre** | Hasta 120 caracteres (mínimo 2 en cotizaciones, reclamos y pasajeros) | El de Mi cuenta no puede quedar vacío. Cada palabra empieza con mayúscula al escribir (un nombre peruano suele tener 4: "Rudy Jayde Choque Cruz") |

**Unicidad**
- Una persona no puede tener el mismo correo y rol dos veces. Un mismo correo puede tener **dos perfiles** (Socio + Conductor).
- **El DNI es de una sola persona dentro de la asociación**, salvo que sea el mismo correo (Socio + Conductor comparten DNI a propósito). La regla se aplica a datos nuevos; los ya existentes no se tocan.
- La licencia es de una sola persona en todo el sistema.

### Estado de la licencia (alerta y bloqueo de la vencida)

| Estado | Cuándo |
|---|---|
| Vigente | Vence en más de 30 días |
| Por vencer | Vence en 30 días o menos |
| Vencida | Ya venció |
| Sin licencia | No hay licencia registrada |

Se ve en Personas (columna y filtro "Requieren atención"), en Mi cuenta, en
la pantalla del conductor y en la tarjeta **"Licencias de conducir por
revisar"** del Inicio del administrador.

**Decisión actualizada (20 sept 2026):** una licencia **vencida impide
inscribirse en la cola** (mensaje claro con la fecha de vencimiento; se rechaza
en el servidor). Un conductor **sin licencia registrada todavía no se bloquea**:
eso es un dato incompleto, no una licencia vencida (los conductores de prueba
no tienen ninguna). Antes (19 sept) era solo alerta.

## 2. Documentos (pasajeros y Libro de Reclamaciones)

Se elige el **tipo de documento** y cada tipo tiene su formato:

| Tipo | Regla | Dónde se ofrece |
|---|---|---|
| DNI | 8 números | Pasajeros y reclamos (por defecto) |
| Carné de extranjería | 9 a 12 letras o números | Pasajeros y reclamos |
| Pasaporte | 6 a 12 letras o números | Pasajeros y reclamos |
| RUC | 11 números y válido (ver §3) | Solo reclamos |

> **Supuesto por confirmar:** los formatos de carné de extranjería (9 a 12)
> y pasaporte (6 a 12) son supuestos razonables, no verificados contra la
> norma. Si Migraciones define otro largo, se cambia en los dos
> `validators.ts`.

- Pasajeros: la columna `dni` guarda el número del documento; el tipo va en `documentType` (por defecto `DNI`). El perfil de pasajero frecuente se identifica por asociación + tipo + número.
- **Límite conocido:** el asistente que digitaliza manifiestos en papel sigue reconociendo solo DNI.

## 3. RUC

- 11 números, empieza con **10, 15, 16, 17 o 20**, y el último es un **dígito verificador** (módulo 11 sobre los 10 primeros).
- Aplica en asociaciones, empresas integrantes, cotizaciones de la landing y reclamos con tipo RUC.
- **Al editar** una asociación o empresa que ya tiene RUC, el dígito verificador solo se revisa **si el RUC cambia**. Así un RUC de prueba ya guardado no impide corregir otros datos.
- Los RUC de prueba de la siembra (`20601234567` y similares) **no** pasan el dígito verificador; los datos existentes se conservan.
- RUC válido para pruebas: **`20999999990`**.

## 4. Unidades y equipos

| Dato | Regla |
|---|---|
| Placa | 3 letras o números + guion + 3 números (`Z0A-001`); el guion se pone solo |
| Marca / modelo | Catálogo: Mercedes Benz Sprinter, Renault Master, Toyota Hiace, **u "Otro"**: se escribe la marca y el modelo a mano y la unidad queda con tipo `OTRO` |
| Año | De 1990 hasta el **año actual + 1** (se calcula solo; el servidor aceptaba hasta 2100) |
| Código de unidad | **Lo escribe el administrador** (cada asociación maneja sus propios códigos; en Virgen de Fátima es el código del socio). Obligatorio, hasta 10 caracteres, único **por asociación** (dos asociaciones pueden tener cada una su "001"). **Nunca se asigna solo**; si ya existe, avisa al escribirlo |
| Código o placa de una unidad dada de baja | No se rechaza como duplicado: se ofrece **restaurar** la unidad |
| **IMEI** del equipo GPS | Exactamente 15 números (vacío = desvincular) |
| **SIM** del equipo GPS | Celular de 9 números |

## 5. Pasajeros del manifiesto

- Asiento entre 1 y la **capacidad de la unidad** (antes el servidor no lo revisaba; solo la pantalla).
- Tarifa desde 0 (sin negativos), máximo S/ 10 000.
- Un asiento ocupado no se repite.

## 6. Contraseña

- 8 a 72 caracteres (72 es el límite real del cifrado).
- Al menos **una letra y un número**.
- No puede ser de las más comunes (`12345678`, `password1`, etc.).
- Se exige al crear o cambiar una contraseña (invitación, recuperar acceso, cuenta de visitante). Las contraseñas que ya existían no se tocan.
- Se decidió letra + número, y **no** mayúsculas y símbolos obligatorios: eso empuja a la gente a patrones predecibles como `Password1!`.

## 7. Largos máximos de texto

Todo texto libre tiene máximo (antes aceptaban hasta 8 MB por campo):

| Campo | Máximo |
|---|---|
| Nombres de personas, representante | 120 |
| Nombre de asociación o empresa, terminales | 150 |
| Ciudad | 100 |
| Motivos y notas cortas | 500 |
| Asunto | 150 |
| Título de aviso | 120 |
| Direcciones | 200 |
| Detalle de reclamo | 3000 |
| Mensajes, avisos, respuestas, notas de configuración | 2000 |
| Lo que solicita el reclamante | 1000 |
| Correo | 254 |

## 8. Configuración operativa (Super Admin)

| Parámetro | Rango |
|---|---|
| Radio GPS de terminal | 50 a 2000 m |
| Tiempo mínimo de viaje (ida / vuelta) | 10 a 600 min |
| Tiempo de espera | 1 a 240 min |
| Velocidad de alerta | 30 a 200 km/h |
| Coordenadas de terminales | Dentro de Perú (latitud −19 a 0, longitud −82 a −68) |

> Estos rangos son propuestas razonables, no cifras del documento maestro.

## 9. Formularios públicos y anti-spam

Cotizaciones, Libro de Reclamaciones y cuentas de visitante los llena
cualquiera sin iniciar sesión. Protecciones (sin captcha, sin fricción):

1. **Límite de 10 envíos por hora** desde la misma conexión (además del límite general). El intento de contraseña tiene su propio límite más estricto.
2. **Campo trampa invisible** (`website`): las personas no lo ven; si llega con contenido, el envío se descarta en silencio y se responde "recibido" para que el robot no aprenda.
3. **Largos máximos** (§7). Las respuestas libres de una cotización se limitan a 10 000 caracteres en total.

Un captcha (más fuerte, pero molesta a quien llena el formulario) queda como
opción si en el futuro aparece spam real.

## 10. Cómo agregar o cambiar una regla

1. Definirla en `backend/src/common/validators.ts` y usarla en el DTO del formulario.
2. Repetirla en `src/lib/validators.ts` y usarla en la pantalla (limpieza mientras se escribe + aviso).
3. Si la pantalla tiene un mensaje propio, mantenerlo igual al del servidor.
4. Probar con casos buenos y malos, y comprobar que servidor y pantalla dan el mismo resultado.

## 11. Rutas de cada asociación

Regla completa en `DOCUMENTO_MAESTRO_NEGOCIO_Y_PRODUCTO.md` §5.4. En datos:

| Dato | Regla |
|---|---|
| **Rutas habilitadas** | Exactamente 2 (ida y retorno), escritas a mano: origen + destino, hasta 60 caracteres cada uno. Sin valores por defecto |
| **Nombre del terminal** | Aparte de la ruta: nombre completo + dirección + ubicación en el mapa |
| **Paradas adicionales** | Solo informativas, sin límite, no crean colas |
| **Asociación sin rutas** | Se muestra "Ida" / "Retorno"; nunca las rutas de otra asociación |

Campos: `routeOriginName`, `routeDestinationName` (ida) y `returnOriginName`,
`returnDestinationName` (retorno) en `OperationalConfig`.

## 12. Eliminar y suspender (20 de septiembre de 2026)

**Suspender** pausa una cuenta o una empresa con todos sus datos y se puede
revertir. **Eliminar** es una baja definitiva con historial:

| Qué | Quién elimina | Se rechaza si… |
|---|---|---|
| **Asociación** | Solo Super Admin (motivo + escribir el nombre exacto) | Tiene viajes en curso o unidades en cola |
| **Administrador** | Solo Super Admin | — |
| **Socio / conductor** | Administrador de la asociación (o Super Admin) | Conductor: viaje en curso, en cola o con unidad asignada. Socio: unidades a su nombre. Nadie se elimina a sí mismo |

- La persona o asociación sale de las listas, del portal y de los avisos; sus cuentas no pueden entrar.
- Su **historial se conserva** (viajes, manifiestos, pasajeros, auditoría) tal como estaba hasta ese día.
- **Volver a registrarla con los mismos datos crea una cuenta nueva** con historial nuevo, "como si nunca hubiera existido": los datos únicos en todo el sistema (RUC, correo, licencia, WhatsApp, equipo GPS) del registro eliminado se marcan con `~E<fecha>` o se liberan.
- Todo queda en Auditoría con el motivo. No hay botón para restaurar una asociación o persona eliminada (los datos siguen en la base).
