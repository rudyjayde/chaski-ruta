// Titulo, descripcion y direccion canonica de cada pagina para Google y las vistas previas al compartir.
// index.html trae los valores de la portada; aqui se ajustan al cambiar de pagina (la app no recarga).
// Las pantallas privadas (paneles, login) se marcan noindex: no deben aparecer en Google.

const SITE = 'https://chaskiai.com.pe';
const NAME = 'CHASKI AI';

const HOME = {
  title: 'CHASKI AI | Software para asociaciones de transporte por turnos',
  description:
    'Software operativo para asociaciones de transporte por turnos. Reemplaza los procesos manuales de cola, venta de pasajes y manifiestos con un sistema digital.',
};

const LEGAL: Record<string, { title: string; description: string }> = {
  'terminos-condiciones': { title: 'Términos y condiciones', description: 'Términos y condiciones de uso de la plataforma CHASKI AI.' },
  'politica-privacidad': { title: 'Política de privacidad', description: 'Cómo CHASKI AI protege y trata los datos personales.' },
  'politica-cookies': { title: 'Política de cookies', description: 'Uso de cookies en la plataforma CHASKI AI.' },
};

const PRIVATE = /^\/(app|portal|ingresar|mi-cuenta|auth|restablecer-contrasena)(\/|$)/;

function setMeta(attr: 'name' | 'property', key: string, content: string | null) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (content === null) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonical(href: string | null) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (href === null) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

export function applyPageMeta(rawPath: string) {
  const path = rawPath.replace(/\/+$/, '') || '/';

  if (PRIVATE.test(path)) {
    document.title = NAME;
    setMeta('name', 'robots', 'noindex, nofollow');
    setCanonical(null);
    return;
  }
  setMeta('name', 'robots', null);

  let title = HOME.title;
  let description = HOME.description;
  if (path === '/empresa') {
    title = `Nosotros | ${NAME}`;
    description = 'Conoce quién está detrás de CHASKI AI, el software para asociaciones de transporte por turnos.';
  } else if (path === '/libro-de-reclamaciones') {
    title = `Libro de Reclamaciones | ${NAME}`;
    description = 'Libro de Reclamaciones virtual de CHASKI AI: registra tu reclamo o queja.';
  } else if (path.startsWith('/legal/')) {
    const legal = LEGAL[path.slice('/legal/'.length)];
    if (legal) {
      title = `${legal.title} | ${NAME}`;
      description = legal.description;
    }
  }

  const url = `${SITE}${path === '/' ? '/' : path}`;
  document.title = title;
  setMeta('name', 'description', description);
  setMeta('property', 'og:title', title);
  setMeta('property', 'og:description', description);
  setMeta('property', 'og:url', url);
  setCanonical(url);
}
