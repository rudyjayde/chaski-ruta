# Correccion Figma Make - Web, landing e identidad CHASKI AI

## Antes de enviar

Reemplaza los dos valores pendientes entre angulos:

- `<URL_PUBLICA_CLOUDINARY_ISOTIPO_TRANSPARENTE_PENDIENTE>`
- `<URL_PUBLICA_CLOUDINARY_PATRON_OPCIONAL>`; si no existe, escribe `NO DISPONIBLE`.

## Prompt para pegar en el proyecto web existente

Corrige el prototipo web actual sin eliminar los paneles, roles, datos DEMO ni flujos operativos que ya funcionan.

La estructura publica correcta no comienza directamente en el login. Implementa estas rutas y navegacion:

1. `/`: landing publica corporativa de CHASKI AI.
2. `/ingresar`: acceso comun.
3. `/app`: plataforma autenticada; despues del login la cuenta determina automaticamente organizacion, rol y panel.

No muestres selector de asociacion ni selector de rol antes de autenticar.

Activos oficiales:

- `CHASKI_ICON_URL = "<URL_PUBLICA_CLOUDINARY_ISOTIPO_TRANSPARENTE_PENDIENTE>"`
- `CHASKI_WORDMARK_URL = "https://res.cloudinary.com/sgf8nwgk/image/upload/e_trim,f_png,q_auto/v1788027352/chaski-AI-nombre_1_1.png"`
- `CHASKI_PATTERN_URL = "<URL_PUBLICA_CLOUDINARY_PATRON_OPCIONAL>"`

Consume estas imagenes mediante URLs HTTPS publicas. Usa `object-fit: contain`. No deformes, recortes, redibujes ni reemplaces el wordmark con una fuente similar. Si una imagen falla, muestra `CHASKI AI` como texto alternativo. No agregues API key, API secret, upload preset ni codigo de carga de Cloudinary.

La frase no forma parte de la imagen. Renderiza siempre este texto exacto:

`Plataformas inteligentes para modernas operaciones`

Elimina cualquier version inglesa de la frase.

Landing `/`:

- Encabezado con identidad CHASKI AI, enlaces `Soluciones`, `Como funciona`, `Planes`, `Empresa` y `Contacto`.
- Botones `Solicitar demostracion` e `Ingresar a la plataforma`.
- `Ingresar a la plataforma` navega a `/ingresar`.
- Primera vista con CHASKI AI como marca principal, la frase oficial y el mensaje: `Creamos plataformas digitales para asociaciones de transporte y operaciones logisticas. Centralizamos colas, ventas, manifiestos, viajes y control operativo en un solo sistema.`
- Secciones: problemas operativos, CHASKI RUTA, como funciona, capacidades, planes `Operacion` y `PRO`, contacto y pie legal.
- No inventes precios, clientes, testimonios ni metricas.
- Pie legal: IMPORT STAR PERUVIAN EIRL, RUC 20609699605, terminos, privacidad, cookies y Libro de Reclamaciones.

Acceso `/ingresar`:

- Reproduce la composicion de la referencia adjunta: identidad centrada arriba, formulario compacto y patron institucional discreto.
- Campos `Usuario o correo` y `Contrasena`, mostrar u ocultar contrasena, `Recuperar acceso`, `Ingresar`, separador `o` y `Continuar con Google`.
- Conserva las cuentas DEMO existentes y la resolucion automatica del panel por cuenta.

Plataforma `/app`:

- Administrador, socio y conductor muestran ATIPCAR como identidad principal.
- Super Admin muestra CHASKI AI.
- No repitas cadenas como `CHASKI AI | CHASKI RUTA | ATIPCAR`.

Mantener React, TypeScript, Inter Variable y `lucide-react`. Verifica 1440, 1280, 1024 y movil web. Al finalizar confirma rutas creadas, activos utilizados y compilacion TypeScript sin errores.
