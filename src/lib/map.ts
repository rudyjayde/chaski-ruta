import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Mapas con Leaflet + OpenStreetMap (1 nov 2026, decidido con Jayde): se
// dejo Google Maps porque activar su facturacion en Peru exige un prepago.
// OpenStreetMap no pide clave ni tarjeta. Compartido por todas las pantallas
// con mapa (flota en vivo, riesgo de ruta, historial GPS, corredor, picker de
// terminal y el mini-mapa del conductor).
//
// Los mosaicos de tile.openstreetmap.org son gratis con trafico moderado
// (https://operations.osmfoundation.org/policies/tiles/) -- si algun dia la
// plataforma crece mucho, se cambia TILE_URL por un proveedor pagado o propio
// sin tocar las pantallas.
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

export const DEFAULT_CENTER: L.LatLngExpression = [-16.02, -69.74];

export function createMap(el: HTMLElement, opts: { center?: L.LatLngExpression; zoom?: number; zoomControl?: boolean } = {}): L.Map {
  const map = L.map(el, {
    center: opts.center ?? DEFAULT_CENTER,
    zoom: opts.zoom ?? 10,
    zoomControl: opts.zoomControl ?? true,
    attributionControl: true,
  });
  map.attributionControl.setPrefix(false);
  L.tileLayer(TILE_URL, { maxZoom: 19, subdomains: 'abc', attribution: ATTRIBUTION }).addTo(map);
  return map;
}

// Punto circular con borde blanco y, opcionalmente, un texto adentro (codigo
// de unidad, "A"/"B") -- equivalente al SymbolPath.CIRCLE + label que se
// usaba en Google Maps.
export function dotIcon(color: string, size: number, label?: string, fontSize = 11, borderWidth = 2): L.DivIcon {
  const html =
    `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:${borderWidth}px solid #fff;` +
    `box-shadow:0 1px 3px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;` +
    `color:#fff;font:700 ${fontSize}px/1 sans-serif;box-sizing:border-box">${label ?? ''}</div>`;
  return L.divIcon({ html, className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2] });
}

// Una asociacion nueva puede no tener todavia sus terminales ubicados: en
// ese caso el mapa se queda en su centro por defecto.
export function fitToTerminals(
  map: L.Map,
  config: { terminalOriginLat: number | null; terminalOriginLng: number | null; terminalDestinationLat: number | null; terminalDestinationLng: number | null },
  padding: number,
) {
  const { terminalOriginLat: oLat, terminalOriginLng: oLng, terminalDestinationLat: dLat, terminalDestinationLng: dLng } = config;
  if (oLat == null || oLng == null || dLat == null || dLng == null) return;
  map.fitBounds([[oLat, oLng], [dLat, dLng]], { padding: [padding, padding] });
}

// Buscador de lugares con Nominatim (el geocodificador gratuito de
// OpenStreetMap). Su politica de uso prohibe autocompletar mientras se
// escribe, por eso solo se llama al presionar Enter / el boton de buscar.
export async function searchPlace(query: string): Promise<{ lat: number; lng: number; name: string } | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=pe&accept-language=es&q=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('search-failed');
  const results = (await res.json()) as { lat: string; lon: string; display_name: string }[];
  if (results.length === 0) return null;
  return { lat: Number(results[0].lat), lng: Number(results[0].lon), name: results[0].display_name };
}

export { L };
