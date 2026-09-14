import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { MapPin } from 'lucide-react';
import { fetchGpsHistory, type GpsHistoryPoint } from '../lib/operacion-api';
import { loadGoogleMaps, getGoogleMaps } from '../lib/google-maps';
import { localDateStr } from '../lib/dates';

// Recorrido real pintado en Google Maps (12 sept 2026, decidido con Jayde):
// compartido entre Socio (su propia unidad) y Super Admin (cualquier
// unidad) -- Administrador NUNCA lo usa, es informacion privada del GPS
// Vehicular individual del socio (ver plan-gps-vehicular.md §4). Mismo
// componente para ambos para que, si alguna vez los dos lo miran, vean
// exactamente el mismo mapa y los mismos numeros.
//
// No guardamos historial de posiciones en nuestra propia base de datos --
// cada consulta le pregunta a Traccar en vivo por ese rango (fetchGpsHistory).
// Por eso no hay ningun limite de dias artificial aqui: el unico limite real
// es cuanto tiempo retiene Traccar mismo esos puntos en su servidor.
type Period = 'hoy' | '7dias' | 'mes' | 'personalizado';

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

// Curso real que reporta Traccar (grados 0-360, 0 = norte) convertido a un
// rotulo de 8 puntos en español -- solo formato, el numero real siempre se
// muestra tambien, nunca se reemplaza.
const COMPASS_LABELS = ['Norte', 'Noreste', 'Este', 'Sureste', 'Sur', 'Suroeste', 'Oeste', 'Noroeste'];
function courseToCompass(course: number): string {
  const index = Math.round(((course % 360) + 360) % 360 / 45) % 8;
  return COMPASS_LABELS[index];
}

export default function GpsRouteHistoryView({ vehicleId, code, plate }: { vehicleId: string; code: string; plate?: string }) {
  const today = localDateStr();
  const weekAgo = localDateStr(new Date(Date.now() - 7 * 24 * 3600 * 1000));
  const monthAgo = localDateStr(new Date(Date.now() - 30 * 24 * 3600 * 1000));
  const [period, setPeriod] = useState<Period>('7dias');
  const [dateFrom, setDateFrom] = useState(weekAgo);
  const [dateTo, setDateTo] = useState(today);
  const [points, setPoints] = useState<GpsHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mapStatus, setMapStatus] = useState<'cargando' | 'listo' | 'sin_api_key'>('cargando');

  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapObjRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const polylineRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const infoWindowRef = useRef<any>(null);

  const from = period === 'hoy' ? today : period === '7dias' ? weekAgo : period === 'mes' ? monthAgo : dateFrom;
  const to = period === 'personalizado' ? dateTo : today;

  // Radio de "parqueo" real (12 sept 2026, verificado en vivo con
  // ATIPCAR-001: 377 puntos validos en una semana, 369 con motion:false y
  // los 8 con motion:true igual reportaban speed:0 -- todos los puntos
  // cayeron dentro de un radio de ~50m del mismo lugar). Si NINGUN punto del
  // periodo se aleja mas de este radio del centro de todos los puntos, la
  // unidad nunca tuvo un desplazamiento real: no se dibuja ninguna linea,
  // solo se marca su ubicacion. Esto evita que el "ruido" normal del GPS
  // parado (que a veces salta mas de los 30m del filtro de segmento) se
  // interprete como un recorrido que nunca existio.
  const STATIONARY_RADIUS_METERS = 60;
  const hasRealMovement = useMemo(() => {
    if (points.length === 0) return false;
    const centroid = points.reduce(
      (acc, p) => ({ lat: acc.lat + p.lat / points.length, lng: acc.lng + p.lng / points.length }),
      { lat: 0, lng: 0 },
    );
    return points.some(p => haversineKm(centroid, p) * 1000 > STATIONARY_RADIUS_METERS);
  }, [points]);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    // Traccar exige ISO 8601 completo con zona horaria.
    fetchGpsHistory(vehicleId, new Date(`${from}T00:00:00`).toISOString(), new Date(`${to}T23:59:59`).toISOString())
      .then(setPoints)
      .catch(err => setError(err instanceof Error ? err.message : 'No se pudo cargar el recorrido.'))
      .finally(() => setLoading(false));
  }, [vehicleId, from, to]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then(() => {
        if (cancelled || !mapRef.current) return;
        const g = getGoogleMaps();
        mapObjRef.current = new g.Map(mapRef.current, {
          zoom: 12,
          center: { lat: -16.02, lng: -69.74 },
          disableDefaultUI: true,
          zoomControl: true,
        });
        infoWindowRef.current = new g.InfoWindow();
        setMapStatus('listo');
      })
      .catch(() => setMapStatus('sin_api_key'));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (mapStatus !== 'listo') return;
    const g = getGoogleMaps();
    const map = mapObjRef.current;
    if (polylineRef.current) { polylineRef.current.setMap(null); polylineRef.current = null; }
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    if (points.length === 0) return;

    // Popup real al hacer clic en cualquier punto (12 sept 2026, a pedido de
    // Jayde): velocidad, kilometraje acumulado, curso y hora -- los 4 datos
    // ya vienen de Traccar, ninguno se calcula "bonito" ni se inventa.
    const openInfo = (marker: unknown, p: GpsHistoryPoint & { cumulativeKm: number }) => {
      infoWindowRef.current.setContent(
        `<div style="font-family:sans-serif;font-size:12.5px;line-height:1.6;color:#1a1a18">` +
          `<strong>Velocidad:</strong> ${p.speedKmh} km/h<br/>` +
          `<strong>Kilometraje:</strong> ${p.cumulativeKm.toFixed(1)} km<br/>` +
          `<strong>Curso:</strong> ${courseToCompass(p.course)} ${Math.round(p.course)}°<br/>` +
          `<strong>Hora:</strong> ${new Date(p.fixTime).toLocaleString('es-PE')}` +
        `</div>`,
      );
      infoWindowRef.current.open(map, marker);
    };

    if (!hasRealMovement) {
      // Nunca hubo un desplazamiento real en el periodo: no se dibuja
      // ninguna linea (seria inventar un recorrido que no existio). Se
      // marca solo la ultima posicion conocida.
      const last = points[points.length - 1];
      const marker = new g.Marker({
        position: { lat: last.lat, lng: last.lng },
        map,
        icon: {
          path: g.SymbolPath.CIRCLE,
          scale: 9,
          fillColor: '#6b7280',
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 2,
        },
      });
      marker.addListener('click', () => openInfo(marker, { ...last, cumulativeKm: 0 }));
      markersRef.current = [marker];
      map.setCenter({ lat: last.lat, lng: last.lng });
      map.setZoom(17);
      return;
    }

    // Filtra el "ruido" normal del GPS estando detenido (12 sept 2026,
    // verificado en vivo con ATIPCAR-001: unidad parada toda la semana,
    // el receptor igual calculaba una posicion distinta cada vez, unos
    // pocos metros alrededor del punto real -- se veia como un zigzag
    // aunque nunca hubo movimiento real). Solo se dibuja un punto nuevo si
    // esta a MIN_SEGMENT_METERS o mas del ultimo punto YA dibujado -- nunca
    // se borra ni se inventa un dato, solo se deja de trazar una linea
    // entre dos puntos que en la practica son "el mismo lugar".
    const MIN_SEGMENT_METERS = 30;
    // Kilometraje acumulado real hasta CADA punto dibujado (no el total nada
    // mas) -- para que el popup de cada punto diga "iba en el km X de este
    // recorrido", igual que el ejemplo de referencia que mando Jayde.
    const drawPoints: (GpsHistoryPoint & { cumulativeKm: number })[] = [];
    for (const p of points) {
      const last = drawPoints[drawPoints.length - 1];
      if (!last) { drawPoints.push({ ...p, cumulativeKm: 0 }); continue; }
      const stepKm = haversineKm(last, p);
      if (stepKm * 1000 >= MIN_SEGMENT_METERS) drawPoints.push({ ...p, cumulativeKm: last.cumulativeKm + stepKm });
    }

    const path = drawPoints.map(p => ({ lat: p.lat, lng: p.lng }));
    polylineRef.current = new g.Polyline({
      path, map, geodesic: true, strokeColor: '#1d3fb8', strokeWeight: 4, strokeOpacity: 0.85,
    });
    const bounds = new g.LatLngBounds();
    path.forEach(pt => bounds.extend(pt));
    map.fitBounds(bounds, 40);

    const pointMarkers = drawPoints.map((p, i) => {
      const isStart = i === 0;
      const isEnd = i === drawPoints.length - 1;
      const marker = new g.Marker({
        position: { lat: p.lat, lng: p.lng },
        map,
        label: isStart ? { text: 'A', color: '#fff', fontSize: '11px', fontWeight: '700' } : isEnd ? { text: 'B', color: '#fff', fontSize: '11px', fontWeight: '700' } : undefined,
        icon: {
          path: g.SymbolPath.CIRCLE,
          scale: isStart || isEnd ? 9 : 5,
          fillColor: isStart ? '#0f9d58' : isEnd ? '#b3261e' : '#1d3fb8',
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: isStart || isEnd ? 2 : 1,
        },
      });
      marker.addListener('click', () => openInfo(marker, p));
      return marker;
    });
    markersRef.current = pointMarkers;
  }, [points, mapStatus, hasRealMovement]);

  const totalKm = hasRealMovement && points.length > 1
    ? points.reduce((sum, p, i) => i === 0 ? 0 : sum + haversineKm(points[i - 1], p), 0)
    : 0;
  const maxSpeed = points.reduce((max, p) => Math.max(max, p.speedKmh), 0);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap items-center">
        {(['hoy', '7dias', 'mes', 'personalizado'] as Period[]).map(v => (
          <button
            key={v}
            onClick={() => setPeriod(v)}
            className={`px-2.5 py-1.5 text-xs rounded border transition-colors ${period === v ? 'bg-primary text-white border-primary' : 'border-border text-t2 hover:bg-hover'}`}
          >
            {v === 'hoy' ? 'Hoy' : v === '7dias' ? 'Últ. 7 días' : v === 'mes' ? 'Este mes' : 'Personalizado'}
          </button>
        ))}
        {period === 'personalizado' && (
          <>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 px-2 border border-border rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-8 px-2 border border-border rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
          </>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          ['Puntos registrados', String(points.length)],
          ['Distancia estimada', `${totalKm.toFixed(1)} km`],
          ['Velocidad máxima', `${maxSpeed} km/h`],
        ].map(([label, value]) => (
          <div key={label} className="bg-surface border border-border rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-t1">{value}</p>
            <p className="text-sm text-t2 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <div className="relative h-96 bg-bg border border-border rounded-lg overflow-hidden">
        <div ref={mapRef} className="absolute inset-0" />
        {mapStatus === 'sin_api_key' && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg">
            <div className="text-center max-w-sm px-4">
              <MapPin size={22} className="mx-auto text-muted mb-1.5" />
              <p className="text-sm text-t1 font-medium">Mapa en configuración</p>
              <p className="text-sm text-t2 mt-1">Falta la clave de Google Maps (VITE_GOOGLE_MAPS_API_KEY) en el entorno.</p>
            </div>
          </div>
        )}
        {mapStatus === 'listo' && !loading && points.length === 0 && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-surface border border-border rounded-lg shadow px-3 py-1.5 text-sm text-t2 text-center max-w-[90%]">
            Sin registros de posición en el rango elegido
          </div>
        )}
        {mapStatus === 'listo' && !loading && points.length > 0 && !hasRealMovement && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-surface border border-border rounded-lg shadow px-3 py-1.5 text-sm text-t2 text-center max-w-[90%]">
            La unidad permaneció en el mismo lugar en este periodo — no hubo un recorrido real que mostrar
          </div>
        )}
      </div>

      {loading && <p className="text-sm text-t2">Cargando recorrido…</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
      <p className="text-xs text-muted">Unidad {code}{plate ? ` · ${plate}` : ''} — recorrido real, sin límite de días: el dato vive en el servidor Traccar, no en CHASKI AI. Si en todo el periodo la unidad nunca se alejó más de {STATIONARY_RADIUS_METERS} m de su lugar, no se dibuja ninguna línea — sería mostrar un recorrido que no existió, solo el "ruido" normal del GPS estando parado. Cuando sí hay desplazamiento real, la línea solo se traza entre puntos con 30 metros o más de diferencia. Haz clic en cualquier punto del mapa para ver su velocidad, kilometraje, curso y hora exactos.</p>
    </div>
  );
}
