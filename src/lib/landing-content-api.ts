// Cliente publico del contenido editable de la landing (Super Admin lo edita
// -- ver operacion-api.ts fetchLandingSection/updateLandingSection). Igual
// que commercial-requests-api.ts, este NO requiere autenticacion: lo usa
// cualquier visitante de la landing publica.
export interface LandingProblem { title: string; desc: string }
export interface LandingCapability { icon: string; label: string; desc: string }
export interface LandingPlan { name: string; desc: string; features: string[] }
export interface LandingPlans { operacion: LandingPlan; pro: LandingPlan; gpsVehicular: LandingPlan }
export interface LandingHero {
  tagline: string;
  title: string;
  subtitle: string;
  // Linea chica debajo del subtitulo (ej. "Para asociaciones de transporte y
  // operaciones logísticas.") -- editable desde Super Admin, nunca fija.
  subtitleCaption: string;
  ctaPrimary: string;
  ctaSecondary: string;
}
// Un cliente real en la vitrina "Clientes de referencia" -- logo de la
// asociacion + una imagen con las rutas que opera, ambas subidas por Super
// Admin (nunca texto que redacte el sistema). Se muestran todos juntos en
// una fila, sin rotar.
export interface LandingClientItem { logoUrl: string; routesImageUrl: string }
export interface LandingFaqItem { question: string; answer: string }
export interface LandingCompany {
  legalName: string;
  ruc: string;
  whatsapp: string;
  address: string;
  contactEmail: string;
  instagramUrl: string;
  facebookUrl: string;
  tiktokUrl: string;
}
export interface LandingLegalPage { title: string; body: string }
// Un elemento de la vitrina de flota: la foto real de una unidad + el nombre
// de la asociacion dueña como texto simple (se muestra con la tipografia del
// sitio, ya no como imagen subida -- corregido 11 sept 2026 a pedido de Jayde).
export interface LandingFleetItem { vehicleImageUrl: string; name: string }
// intervalSeconds: cada cuanto avanza sola la vitrina -- editable desde Super
// Admin, nunca fijo en el codigo. Se muestran de a 2 unidades por pagina fija
// (1-2, 3-4, ...); si el numero de items es impar la ultima pagina muestra 1 sola.
export interface LandingFleetShowcase { items: LandingFleetItem[]; intervalSeconds: number }
// Fondo compartido del bloque hero + vitrina de flota (subido por Super Admin
// en "Landing fondo") -- vacio hasta que se suba una imagen real; mientras
// tanto el hero se ve igual que siempre (fondo plano del tema).
export interface LandingHeroBackground { imageUrl: string }

export interface LandingContentData {
  HERO: LandingHero;
  PROBLEMS: LandingProblem[];
  CAPABILITIES: LandingCapability[];
  PLANS: LandingPlans;
  CLIENTS_SHOWCASE: LandingClientItem[];
  FAQ: LandingFaqItem[];
  COMPANY: LandingCompany;
  FLEET_SHOWCASE: LandingFleetShowcase;
  HERO_BACKGROUND: LandingHeroBackground;
  // Pagina publica "Sobre nosotros" (footer -> Empresa -> Sobre nosotros).
  // Mismo shape que las paginas legales (titulo + cuerpo libre) pero sin
  // fecha de "ultima actualizacion" legal -- ver fetchAboutPage().
  ABOUT: LandingLegalPage;
  // El GET publico masivo (fetchLandingContent) tambien las devuelve -- Super
  // Admin las edita como una seccion mas (ver SuperAdminApp.tsx). La landing
  // publica en si NO las lee de aca: usa fetchLegalPage, que ademas trae
  // updatedAt para mostrar la fecha real en /legal/:slug.
  LEGAL_TERMS: LandingLegalPage;
  LEGAL_PRIVACY: LandingLegalPage;
  LEGAL_COOKIES: LandingLegalPage;
}

// Claves de las paginas legales -- usadas por la ruta publica /legal/:slug.
// El slug de la URL (mas amigable) se mapea a la clave real del backend.
export const LEGAL_PAGE_SLUGS = {
  'terminos-condiciones': 'LEGAL_TERMS',
  'politica-privacidad': 'LEGAL_PRIVACY',
  'politica-cookies': 'LEGAL_COOKIES',
} as const;
export type LegalPageSlug = keyof typeof LEGAL_PAGE_SLUGS;

function apiUrl(): string {
  const url = import.meta.env.VITE_API_URL as string | undefined;
  if (!url) throw new Error('Falta configurar VITE_API_URL');
  return url;
}

// FLEET_SHOWCASE guardo antes como un arreglo simple (sin segundos
// configurables) -- normaliza esa forma vieja a la nueva {items, intervalSeconds}
// para no perder las imagenes ya subidas por Super Admin.
function normalizeFleetShowcase(value: unknown): LandingFleetShowcase {
  if (Array.isArray(value)) return { items: value as LandingFleetItem[], intervalSeconds: 3 };
  const v = value as Partial<LandingFleetShowcase> | undefined;
  return { items: v?.items ?? [], intervalSeconds: v?.intervalSeconds ?? 3 };
}

// Devuelve null en cualquier falla (red caida, backend abajo, etc.) en vez de
// lanzar -- Landing.tsx ya arranca con el contenido de siempre como valor
// inicial, asi que un fetch fallido nunca deja la pagina publica en blanco.
export async function fetchLandingContent(): Promise<LandingContentData | null> {
  try {
    const res = await fetch(`${apiUrl()}/landing-content`);
    if (!res.ok) return null;
    const data = (await res.json()) as LandingContentData;
    data.FLEET_SHOWCASE = normalizeFleetShowcase(data.FLEET_SHOWCASE);
    return data;
  } catch {
    return null;
  }
}

// Publico -- una pagina legal puntual, con su fecha de ultima actualizacion
// real (null si Super Admin todavia no la edito nunca, en cuyo caso se
// muestra el borrador inicial). GET /landing-content/:key es publico (ver
// landing-content.controller.ts) igual que el resto de esta tabla.
export async function fetchLegalPage(slug: LegalPageSlug): Promise<{ title: string; body: string; updatedAt: string | null } | null> {
  try {
    const key = LEGAL_PAGE_SLUGS[slug];
    const res = await fetch(`${apiUrl()}/landing-content/${key}`);
    if (!res.ok) return null;
    const body = (await res.json()) as { data: LandingLegalPage; updatedAt: string | null };
    return { title: body.data.title, body: body.data.body, updatedAt: body.updatedAt };
  } catch {
    return null;
  }
}

// Publico -- pagina "Sobre nosotros" (footer -> Empresa -> Sobre nosotros).
// Mismo patron que fetchLegalPage, clave ABOUT en vez de un slug legal.
export async function fetchAboutPage(): Promise<{ title: string; body: string; updatedAt: string | null } | null> {
  try {
    const res = await fetch(`${apiUrl()}/landing-content/ABOUT`);
    if (!res.ok) return null;
    const body = (await res.json()) as { data: LandingLegalPage; updatedAt: string | null };
    return { title: body.data.title, body: body.data.body, updatedAt: body.updatedAt };
  } catch {
    return null;
  }
}
