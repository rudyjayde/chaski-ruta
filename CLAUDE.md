@AGENTS.md

## Separación obligatoria entre web y aplicación nativa

**Regla permanente para agentes (Claude Code y cualquier otro).** Antes de diseñar o
modificar una pantalla, identificar:

1. Producto al que pertenece: landing pública, plataforma web, o aplicación nativa.
2. Rol de usuario: SUPERADMIN, ADMINISTRADOR, SOCIO o CONDUCTOR.
3. Viewport principal: escritorio (web) o celular (nativa).
4. Backend o endpoints que consume.
5. Si se trata de una función web ya construida, o una futura función nativa
   todavía sin construir.

El proyecto React + Vite actual (esta carpeta) **es la plataforma web, no la
aplicación móvil nativa**. La futura aplicación móvil nativa es otro proyecto,
en otra tecnología (Flutter, decidido — ver
`docs/planes/plataformas-web-y-app-nativa.md`), y **no se construye dentro de
este proyecto React/Vite sin autorización explícita**.

### Las pantallas de Super Admin y administración web se diseñan desktop-first

- Sidebar.
- Tablas.
- Formularios de varias columnas.
- Filtros horizontales.
- Paneles laterales.
- Modales.
- Uso eficiente del ancho disponible.

### En escritorio NO utilizar

- Contenedores con apariencia de teléfono.
- Anchos máximos de 400–500 px para toda la pantalla.
- Navegación inferior móvil.
- Botones ocupando todo el ancho sin necesidad.
- Información tabular convertida innecesariamente en tarjetas gigantes.
- Todos los campos apilados cuando existe espacio horizontal.
- Patrones de app nativa dentro del panel web.

"Responsive" significa que la plataforma web se adapta a pantallas pequeñas —
**no** significa que la vista de escritorio deba diseñarse como si fuera una
aplicación de teléfono.

### Orden de construcción acordado con Jayde (CHASKI AI)

Primero se termina y consolida el sistema web (plataforma + backend +
funciones de IA aplicadas al negocio). La aplicación nativa en Flutter se
construye **al final**, una vez que el sistema web esté completo — ver
`docs/planes/plataformas-web-y-app-nativa.md` §6.3.

Fuente completa de las reglas de negocio: `docs/planes/DOCUMENTO_MAESTRO_NEGOCIO_Y_PRODUCTO.md`.
