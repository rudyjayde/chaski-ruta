import { useEffect, useRef, useState } from 'react';
import { Search, Loader2, LocateFixed, Maximize2, Minimize2 } from 'lucide-react';
import { createMap, dotIcon, searchPlace, L } from '../lib/map';

// Selector real de coordenadas (OpenStreetMap) para un terminal -- reemplaza
// al MapPickerModal de prototipo (buscador contra una lista fija, mapa
// dibujado con CSS). Tiene buscador real (Nominatim, limitado a Peru) para
// saltar rapido a un lugar como "Juliaca" -- y despues, para el punto EXACTO
// de la terminal, se afina haciendo clic o arrastrando el pin sobre el mapa
// real, que sigue siendo mas preciso que confiar en que una direccion de
// texto caiga justo en la puerta del terminal.
interface TerminalMapPickerProps {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
  heightClass?: string;
}

const DEFAULT_CENTER: L.LatLngExpression = [-15.97, -69.8]; // centro aproximado del altiplano Puno, solo si no hay nada guardado todavia
const PIN_COLOR = '#dc2626';

export default function TerminalMapPicker({ lat, lng, onChange, heightClass = 'h-64' }: TerminalMapPickerProps) {
  const [ready, setReady] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObjRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const myLocationMarkerRef = useRef<L.Marker | null>(null);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState('');
  const [expanded, setExpanded] = useState(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // El pin de la terminal solo existe cuando ya hay un punto elegido.
  const placePin = (position: L.LatLngExpression) => {
    const map = mapObjRef.current;
    if (!map) return;
    if (markerRef.current) {
      markerRef.current.setLatLng(position);
      return;
    }
    const marker = L.marker(position, { draggable: true, icon: dotIcon(PIN_COLOR, 22) }).addTo(map);
    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      onChangeRef.current(pos.lat, pos.lng);
    });
    markerRef.current = marker;
  };

  useEffect(() => {
    if (!mapRef.current) return;
    const hasValue = lat != null && lng != null;
    const map = createMap(mapRef.current, { center: hasValue ? [lat, lng] : DEFAULT_CENTER, zoom: hasValue ? 15 : 11 });
    mapObjRef.current = map;
    if (hasValue) placePin([lat, lng]);

    map.on('click', (e: L.LeafletMouseEvent) => {
      placePin(e.latlng);
      onChangeRef.current(e.latlng.lat, e.latlng.lng);
    });

    setReady(true);
    return () => {
      map.remove();
      mapObjRef.current = null;
      markerRef.current = null;
      myLocationMarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Si el valor llega/cambia desde afuera (ej. al abrir el picker con
  // coordenadas ya guardadas), reposiciona el pin sin recrear el mapa.
  useEffect(() => {
    if (!ready || lat == null || lng == null) return;
    placePin([lat, lng]);
    mapObjRef.current?.panTo([lat, lng]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, ready]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);

  const handleSearch = async () => {
    const q = query.trim();
    if (!q || !mapObjRef.current) return;
    setSearching(true);
    setMessage('');
    try {
      const place = await searchPlace(q);
      if (!place) {
        setMessage(`No se encontró "${q}". Prueba con otro nombre o marca el punto en el mapa.`);
        return;
      }
      mapObjRef.current.setView([place.lat, place.lng], 15);
      placePin([place.lat, place.lng]);
      onChangeRef.current(place.lat, place.lng);
    } catch {
      setMessage('No se pudo buscar ahora. Marca el punto directamente en el mapa.');
    } finally {
      setSearching(false);
    }
  };

  // "Mi ubicacion": pide el GPS del navegador y muestra el punto azul. Es
  // solo referencia para ubicarte: no toca el pin de la terminal.
  const handleLocate = () => {
    setMessage('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const map = mapObjRef.current;
        if (!map) return;
        const position: L.LatLngExpression = [pos.coords.latitude, pos.coords.longitude];
        map.setView(position, 16);
        if (myLocationMarkerRef.current) {
          myLocationMarkerRef.current.setLatLng(position);
        } else {
          myLocationMarkerRef.current = L.marker(position, { icon: dotIcon('#4285F4', 16), interactive: false, zIndexOffset: 1000 }).addTo(map);
        }
      },
      () => setMessage('No se pudo obtener tu ubicación. Revisa el permiso de ubicación del navegador (icono de candado junto a la URL).'),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  return (
    // El contenedor exterior guarda el lugar en la pagina mientras el mapa esta
    // expandido. Es el MISMO mapa cambiando de tamano (no uno nuevo), asi
    // conserva zoom y pin; createMap lo reajusta con su ResizeObserver.
    <div className={`relative ${heightClass}`}>
      {expanded && <div className="fixed inset-0 z-[1999] bg-black/50" onClick={() => setExpanded(false)} aria-hidden="true" />}
      <div
        className={`isolate bg-bg overflow-hidden border border-border ${
          expanded ? 'fixed inset-4 md:inset-8 z-[2000] rounded-xl shadow-2xl' : 'absolute inset-0 rounded-lg'
        }`}
      >
      <div ref={mapRef} className="absolute inset-0" />
      {ready && (
        <div className="absolute z-[1000] top-2 left-12 right-14 flex items-center gap-1.5 bg-surface border border-border rounded-lg shadow px-2.5 py-1.5">
          {searching ? <Loader2 size={14} className="text-muted flex-shrink-0 animate-spin" /> : <Search size={14} className="text-muted flex-shrink-0" />}
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleSearch(); } }}
            placeholder="Buscar lugar y presionar Enter (ej. Juliaca)…"
            className="flex-1 min-w-0 text-sm text-t1 bg-transparent focus:outline-none placeholder:text-muted"
          />
        </div>
      )}
      {ready && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? 'Reducir mapa' : 'Expandir mapa'}
          aria-label={expanded ? 'Reducir mapa' : 'Expandir mapa'}
          className="absolute z-[1000] top-2 right-2 w-9 h-9 flex items-center justify-center bg-surface border border-border rounded-lg shadow text-t1 hover:bg-hover"
        >
          {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      )}
      {ready && 'geolocation' in navigator && (
        <button
          type="button"
          onClick={handleLocate}
          title="Mi ubicación"
          aria-label="Mi ubicación"
          className="absolute z-[1000] bottom-8 right-2 w-9 h-9 flex items-center justify-center bg-white rounded-lg shadow text-[#4285F4] hover:bg-gray-50"
        >
          <LocateFixed size={18} />
        </button>
      )}
      {ready && lat == null && !message && (
        <div className="absolute z-[1000] bottom-8 left-1/2 -translate-x-1/2 bg-surface border border-border rounded-lg shadow px-3 py-1.5 text-sm text-t2">
          Busca el lugar o haz clic en el mapa para marcar la ubicación exacta
        </div>
      )}
      {message && (
        <div className="absolute z-[1000] bottom-8 left-2 right-12 bg-surface border border-danger/30 text-danger text-xs rounded-lg shadow px-3 py-1.5">
          {message}
        </div>
      )}
      {expanded && lat != null && lng != null && !message && (
        <div className="absolute z-[1000] bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-surface border border-border rounded-lg shadow pl-3 pr-1.5 py-1.5">
          <span className="text-sm text-t2 whitespace-nowrap">Arrastra el pin para ajustarlo · <span className="font-mono">{lat.toFixed(5)}, {lng.toFixed(5)}</span></span>
          <button type="button" onClick={() => setExpanded(false)} className="px-3 py-1 text-sm font-medium bg-primary text-white rounded-md hover:bg-primary-h">Listo</button>
        </div>
      )}
      </div>
    </div>
  );
}
