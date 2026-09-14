import { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Undo2, Trash2, Save, Loader2 } from 'lucide-react';
import { loadGoogleMaps, getGoogleMaps } from '../../lib/google-maps';
import { fetchOperationalConfig, fetchRouteGeofence, saveRouteGeofence, type OperationalConfig, type GeofencePoint } from '../../lib/operacion-api';

// Corredor autorizado (12 sept 2026, decidido con Jayde): el administrador
// dibuja a mano el corredor REAL sobre el mapa -- nunca se genera
// automaticamente a partir de una linea recta entre los dos terminales (la
// carretera de montaña tiene curvas reales). El poligono dibujado alimenta
// la alerta FUERA_DE_RUTA (gps-alerts.service.ts): una unidad con viaje
// activo cuya posicion cae fuera de este poligono.
//
// Dibujo por CLIC (12 sept 2026, tras revertir el modo "lapiz" de arrastre
// continuo): el modo lapiz producia un error interno real de la propia
// libreria de Google Maps ("Cannot read properties of undefined (reading
// '__e3_')") que rompia el dibujo -- persistio incluso despues de sacar la
// libreria 'geometry', asi que el problema era el patron mousedown/
// mousemove en si, no una libreria puntual. Se volvio a este modo, que es
// el que se probo estable desde el principio: un clic = un punto nuevo.
//
// El poligono se crea UNA SOLA VEZ y su `path` se muta en el lugar
// (push/pop) -- nunca se destruye y se vuelve a crear en cada clic. Una vez
// que hay 3+ puntos, el poligono queda `editable` (funcion nativa de Google
// Maps): arrastrar cualquier vertice lo mueve, arrastrar el punto medio de
// un borde agrega uno nuevo ahi, clic derecho sobre un vertice lo borra.
export default function RouteGeofencePage() {
  const [config, setConfig] = useState<OperationalConfig | null>(null);
  const [points, setPoints] = useState<GeofencePoint[]>([]);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [mapStatus, setMapStatus] = useState<'cargando' | 'listo' | 'sin_api_key'>('cargando');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);

  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapObjRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const polygonRef = useRef<any>(null);
  const pointsRef = useRef<GeofencePoint[]>([]);
  const syncingFromPathRef = useRef(false);

  useEffect(() => {
    Promise.all([fetchOperationalConfig(), fetchRouteGeofence()])
      .then(([cfg, geofence]) => {
        setConfig(cfg);
        if (geofence) {
          setPoints(geofence.points);
          pointsRef.current = geofence.points;
          setSavedAt(geofence.updatedAt);
        }
      })
      .catch(err => setError(err instanceof Error ? err.message : 'No se pudo cargar el corredor.'))
      .finally(() => setLoading(false));
  }, []);

  // Crea el poligono UNA SOLA VEZ (si todavia no existe) con los puntos
  // actuales, y engancha los listeners de edicion sobre su `path` -- que
  // vive mientras exista el poligono, nunca se vuelve a enganchar.
  const ensurePolygon = useCallback((): // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any | null => {
    const g = getGoogleMaps();
    const map = mapObjRef.current;
    if (!g || !map) return null;
    if (polygonRef.current) return polygonRef.current;

    const polygon = new g.Polygon({
      paths: pointsRef.current,
      strokeColor: '#dc2626',
      strokeWeight: 2,
      fillColor: '#dc2626',
      fillOpacity: 0.15,
      editable: pointsRef.current.length >= 3,
      draggable: false, // mover el poligono ENTERO no tiene sentido aca -- solo vertices
      map,
    });
    polygonRef.current = polygon;

    const syncFromPath = () => {
      if (syncingFromPathRef.current) return; // evita el eco: nosotros mismos disparamos el evento al hacer push/pop
      const path = polygon.getPath();
      const next: GeofencePoint[] = [];
      path.forEach((latLng: { lat: () => number; lng: () => number }) => next.push({ lat: latLng.lat(), lng: latLng.lng() }));
      pointsRef.current = next;
      setPoints(next);
      setDirty(true);
    };
    const path = polygon.getPath();
    g.event.addListener(path, 'insert_at', syncFromPath);
    g.event.addListener(path, 'remove_at', syncFromPath);
    g.event.addListener(path, 'set_at', syncFromPath);

    return polygon;
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then(() => {
        if (cancelled || !mapRef.current) return;
        const g = getGoogleMaps();
        const map = new g.Map(mapRef.current, {
          zoom: 10,
          center: { lat: -16.02, lng: -69.74 },
          zoomControl: true,
          streetViewControl: false,
        });
        mapObjRef.current = map;

        map.addListener('click', (e: { latLng: { lat: () => number; lng: () => number } }) => {
          const p = { lat: e.latLng.lat(), lng: e.latLng.lng() };
          if (!polygonRef.current) {
            // Primer punto: el poligono se crea RECIEN aca, con este punto
            // ya adentro -- nunca con `paths: []` vacio (eso era la causa
            // real del error interno de Google Maps: "Cannot read
            // properties of undefined (reading '__e3_')", confirmado en
            // pruebas reales el 12 sept 2026).
            pointsRef.current = [p];
            setPoints(pointsRef.current);
            setDirty(true);
            ensurePolygon();
            return;
          }
          syncingFromPathRef.current = true;
          polygonRef.current.getPath().push(new g.LatLng(p.lat, p.lng));
          syncingFromPathRef.current = false;
          pointsRef.current = [...pointsRef.current, p];
          setPoints(pointsRef.current);
          setDirty(true);
          if (pointsRef.current.length >= 3) polygonRef.current.setEditable(true);
        });

        setMapStatus('listo');
      })
      .catch(() => setMapStatus('sin_api_key'));
    return () => { cancelled = true; };
  }, [ensurePolygon]);

  // Centra el mapa en los terminales reales de ESTA asociación, y crea el
  // poligono con el corredor ya guardado (si existe) apenas el mapa y los
  // datos están listos.
  useEffect(() => {
    if (mapStatus !== 'listo' || !config) return;
    const g = getGoogleMaps();
    const bounds = new g.LatLngBounds();
    bounds.extend({ lat: config.terminalOriginLat, lng: config.terminalOriginLng });
    bounds.extend({ lat: config.terminalDestinationLat, lng: config.terminalDestinationLng });
    mapObjRef.current.fitBounds(bounds, 60);
    if (pointsRef.current.length >= 2) ensurePolygon();
  }, [mapStatus, config, ensurePolygon]);

  const handleUndo = () => {
    const polygon = polygonRef.current;
    if (!polygon || pointsRef.current.length === 0) return;
    syncingFromPathRef.current = true;
    polygon.getPath().pop();
    syncingFromPathRef.current = false;
    pointsRef.current = pointsRef.current.slice(0, -1);
    setPoints(pointsRef.current);
    setDirty(true);
  };

  const handleClear = () => {
    if (polygonRef.current) polygonRef.current.setMap(null);
    polygonRef.current = null;
    pointsRef.current = [];
    setPoints([]);
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const result = await saveRouteGeofence(points);
      setSavedAt(result.updatedAt);
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el corredor.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-t1">Corredor autorizado</h1>
        <p className="text-sm text-t2 mt-0.5">
          Dibuja a mano la zona real por donde deben circular las unidades, siguiendo la carretera real.
        </p>
      </div>

      <div className="bg-primary/5 border border-primary/25 rounded-lg p-4 text-sm text-t1">
        Cuando una unidad con viaje activo se detecte fuera de esta zona, se genera una alerta real ("Fuera del corredor autorizado") — nunca se ejecuta ninguna acción sola, es evidencia para que revises.
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={handleUndo} disabled={loading || points.length === 0} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-t2 border border-border rounded-lg hover:bg-hover disabled:opacity-40">
          <Undo2 size={14} /> Deshacer último punto
        </button>
        <button onClick={handleClear} disabled={loading || points.length === 0} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-danger border border-danger/30 rounded-lg hover:bg-danger/5 disabled:opacity-40">
          <Trash2 size={14} /> Limpiar todo
        </button>
        <button onClick={handleSave} disabled={loading || saving || points.length < 3} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary-h disabled:opacity-50 ml-auto">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? 'Guardando…' : 'Guardar corredor'}
        </button>
      </div>

      <p className="text-xs text-t2">
        Haz clic en el mapa para ir agregando puntos, siguiendo la carretera real, hasta encerrar el corredor. Con 3 o más puntos, puedes arrastrar cualquiera para ajustarlo, arrastrar el punto medio de un borde para agregar uno nuevo ahí, o hacer clic derecho sobre un punto para borrarlo.
      </p>

      {/* El <div> del mapa se renderiza SIEMPRE, nunca detrás de un `loading ?`
          -- Google Maps necesita que el contenedor ya exista en el DOM en el
          momento en que se crea el mapa (useEffect de montaje). */}
      <div className="relative h-[60vh] min-h-[360px] bg-bg border border-border rounded-lg overflow-hidden">
        <div ref={mapRef} className="absolute inset-0" />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg">
            <Loader2 size={20} className="animate-spin text-muted" />
          </div>
        )}
        {!loading && mapStatus === 'sin_api_key' && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg">
            <div className="text-center max-w-sm px-4">
              <MapPin size={22} className="mx-auto text-muted mb-1.5" />
              <p className="text-sm text-t1 font-medium">Mapa en configuración</p>
              <p className="text-sm text-t2 mt-1">Falta la clave de Google Maps (VITE_GOOGLE_MAPS_API_KEY) en el entorno.</p>
            </div>
          </div>
        )}
      </div>

      {!loading && (
        <p className="text-sm text-t2">
          {points.length} punto(s) marcado(s) {points.length > 0 && points.length < 3 && '— necesitas al menos 3 para formar una zona'}
          {savedAt && !dirty && ` · Guardado ${new Date(savedAt).toLocaleString('es-PE')}`}
          {dirty && ' · Cambios sin guardar'}
        </p>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
