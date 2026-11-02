import { useState, useEffect, useRef } from 'react';
import { Undo2, Trash2, Save, Loader2 } from 'lucide-react';
import { createMap, dotIcon, fitToTerminals, L } from '../../lib/map';
import { fetchOperationalConfig, fetchRouteGeofence, saveRouteGeofence, type OperationalConfig, type GeofencePoint } from '../../lib/operacion-api';

// Corredor autorizado (12 sept 2026, decidido con Jayde): el administrador
// dibuja a mano el corredor REAL sobre el mapa -- nunca se genera
// automaticamente a partir de una linea recta entre los dos terminales (la
// carretera de montaña tiene curvas reales). El poligono dibujado alimenta
// la alerta FUERA_DE_RUTA (gps-alerts.service.ts): una unidad con viaje
// activo cuya posicion cae fuera de este poligono.
//
// Dibujo por CLIC: un clic = un punto nuevo (el modo "lapiz" de arrastre
// continuo se descarto el 12 sept 2026 por inestable).
//
// Edicion (1 nov 2026, al pasar de Google Maps a Leaflet, que no trae
// poligonos editables de serie): cada vertice es un marcador arrastrable,
// clic derecho sobre un vertice lo borra, y con 3+ puntos aparece un punto
// tenue en la mitad de cada borde -- clic sobre el agrega un vertice nuevo
// ahi. Cada cambio vuelve a dibujar la capa entera desde pointsRef, que es
// la unica fuente de verdad.
const ZONE_COLOR = '#dc2626';

export default function RouteGeofencePage() {
  const [config, setConfig] = useState<OperationalConfig | null>(null);
  const [points, setPoints] = useState<GeofencePoint[]>([]);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapObjRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const pointsRef = useRef<GeofencePoint[]>([]);
  const redrawRef = useRef<() => void>(() => {});

  const commit = (next: GeofencePoint[]) => {
    pointsRef.current = next;
    setPoints(next);
    setDirty(true);
    redrawRef.current();
  };

  redrawRef.current = () => {
    const map = mapObjRef.current;
    if (!map) return;
    layerRef.current?.remove();
    const group = L.layerGroup().addTo(map);
    layerRef.current = group;
    const pts = pointsRef.current;
    if (pts.length === 0) return;

    // No interactivo: un clic dentro de la zona tambien agrega un punto.
    const polygon = L.polygon(pts, { color: ZONE_COLOR, weight: 2, fillColor: ZONE_COLOR, fillOpacity: 0.15, interactive: false }).addTo(group);

    pts.forEach((p, i) => {
      const vertex = L.marker(p, { draggable: true, icon: dotIcon(ZONE_COLOR, 14), zIndexOffset: 1000 }).addTo(group);
      const moved = () => {
        const { lat, lng } = vertex.getLatLng();
        return pointsRef.current.map((q, j) => (j === i ? { lat, lng } : q));
      };
      vertex.on('drag', () => polygon.setLatLngs(moved()));
      vertex.on('dragend', () => commit(moved()));
      vertex.on('contextmenu', (e: L.LeafletMouseEvent) => {
        L.DomEvent.preventDefault(e.originalEvent);
        commit(pointsRef.current.filter((_, j) => j !== i));
      });
    });

    if (pts.length >= 3) {
      pts.forEach((p, i) => {
        const q = pts[(i + 1) % pts.length];
        const mid = { lat: (p.lat + q.lat) / 2, lng: (p.lng + q.lng) / 2 };
        L.marker(mid, { icon: dotIcon(ZONE_COLOR, 10, undefined, 11, 1), opacity: 0.55, title: 'Agregar punto aquí' })
          .on('click', () => commit([...pointsRef.current.slice(0, i + 1), mid, ...pointsRef.current.slice(i + 1)]))
          .addTo(group);
      });
    }
  };

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

  useEffect(() => {
    if (!mapRef.current) return;
    const map = createMap(mapRef.current);
    mapObjRef.current = map;
    map.on('click', (e: L.LeafletMouseEvent) => {
      commit([...pointsRef.current, { lat: e.latlng.lat, lng: e.latlng.lng }]);
    });
    setMapReady(true);
    return () => {
      map.remove();
      mapObjRef.current = null;
      layerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Centra el mapa en los terminales reales de ESTA asociación, y dibuja el
  // corredor ya guardado (si existe) apenas el mapa y los datos están listos.
  useEffect(() => {
    if (!mapReady || !config || !mapObjRef.current) return;
    fitToTerminals(mapObjRef.current, config, 60);
    redrawRef.current();
  }, [mapReady, config]);

  const handleUndo = () => {
    if (pointsRef.current.length === 0) return;
    commit(pointsRef.current.slice(0, -1));
  };

  const handleClear = () => commit([]);

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
        Haz clic en el mapa para ir agregando puntos, siguiendo la carretera real, hasta encerrar el corredor. Puedes arrastrar cualquier punto para ajustarlo o hacer clic derecho sobre él para borrarlo. Con 3 o más puntos, haz clic en el punto tenue de la mitad de un borde para agregar uno nuevo ahí.
      </p>

      {/* El <div> del mapa se renderiza SIEMPRE, nunca detrás de un `loading ?`
          -- el mapa necesita que el contenedor ya exista en el DOM en el
          momento en que se crea (useEffect de montaje). */}
      <div className="relative isolate h-[60vh] min-h-[360px] bg-bg border border-border rounded-lg overflow-hidden">
        <div ref={mapRef} className="absolute inset-0" />
        {loading && (
          <div className="absolute z-[1000] inset-0 flex items-center justify-center bg-bg">
            <Loader2 size={20} className="animate-spin text-muted" />
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
