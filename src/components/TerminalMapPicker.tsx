import { useEffect, useRef, useState } from 'react';
import { MapPin, Search } from 'lucide-react';
import { loadGoogleMaps, getGoogleMaps } from '../lib/google-maps';

// Selector real de coordenadas (Google Maps) para un terminal -- reemplaza al
// MapPickerModal de prototipo (buscador contra una lista fija, mapa dibujado
// con CSS). Tiene buscador real (Places Autocomplete, sesgado a la zona de
// Puno/altiplano) para saltar rapido a un lugar como "Juliaca" -- y despues,
// para el punto EXACTO de la terminal, se afina haciendo clic o arrastrando
// el pin sobre el mapa real, que sigue siendo mas preciso que confiar en que
// una direccion de texto caiga justo en la puerta del terminal.
interface TerminalMapPickerProps {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
  heightClass?: string;
}

const DEFAULT_CENTER = { lat: -15.97, lng: -69.8 }; // centro aproximado del altiplano Puno, solo si no hay nada guardado todavia

export default function TerminalMapPicker({ lat, lng, onChange, heightClass = 'h-64' }: TerminalMapPickerProps) {
  const [status, setStatus] = useState<'cargando' | 'listo' | 'sin_api_key'>('cargando');
  const mapRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapObjRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const myLocationMarkerRef = useRef<any>(null);
  const [locateError, setLocateError] = useState('');
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then(() => {
        if (cancelled || !mapRef.current) return;
        const g = getGoogleMaps();
        const center = lat != null && lng != null ? { lat, lng } : DEFAULT_CENTER;
        const map = new g.Map(mapRef.current, {
          zoom: lat != null && lng != null ? 15 : 11,
          center,
          streetViewControl: false,
          fullscreenControl: false,
        });
        mapObjRef.current = map;

        const marker = new g.Marker({
          map,
          position: center,
          draggable: true,
          visible: lat != null && lng != null,
        });
        marker.addListener('dragend', () => {
          const pos = marker.getPosition();
          onChangeRef.current(pos.lat(), pos.lng());
        });
        map.addListener('click', (e: { latLng: { lat: () => number; lng: () => number } }) => {
          marker.setPosition(e.latLng);
          marker.setVisible(true);
          onChangeRef.current(e.latLng.lat(), e.latLng.lng());
        });
        markerRef.current = marker;

        // "Mi ubicacion" -- boton nativo del mapa (se agrega como control de
        // Maps para que Google lo posicione solo, sin pisar el zoom) que pide
        // el GPS del navegador y muestra el punto azul de siempre. Es solo
        // referencia para ubicarte: no toca el pin de la terminal.
        if (navigator.geolocation) {
          const locateBtn = document.createElement('button');
          locateBtn.type = 'button';
          locateBtn.title = 'Mi ubicación';
          locateBtn.setAttribute('aria-label', 'Mi ubicación');
          locateBtn.style.cssText = 'background:#fff;border:none;border-radius:8px;width:38px;height:38px;margin:8px;box-shadow:0 1px 4px rgba(0,0,0,.3);cursor:pointer;display:flex;align-items:center;justify-content:center;';
          locateBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4285F4" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2" fill="#4285F4"/><line x1="12" y1="1" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="23"/><line x1="1" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="23" y2="12"/></svg>';
          locateBtn.addEventListener('click', () => {
            setLocateError('');
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                const position = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                map.panTo(position);
                map.setZoom(16);
                if (myLocationMarkerRef.current) {
                  myLocationMarkerRef.current.setPosition(position);
                  myLocationMarkerRef.current.setVisible(true);
                } else {
                  myLocationMarkerRef.current = new g.Marker({
                    map,
                    position,
                    draggable: false,
                    zIndex: 999,
                    icon: {
                      path: g.SymbolPath.CIRCLE,
                      scale: 7,
                      fillColor: '#4285F4',
                      fillOpacity: 1,
                      strokeColor: '#ffffff',
                      strokeWeight: 2,
                    },
                    title: 'Tu ubicación',
                  });
                }
              },
              () => setLocateError('No se pudo obtener tu ubicación. Revisa el permiso de ubicación del navegador (icono de candado junto a la URL).'),
              { enableHighAccuracy: true, timeout: 8000 },
            );
          });
          map.controls[g.ControlPosition.RIGHT_BOTTOM].push(locateBtn);
        }

        // Esto SOLO arma el mapa/marcador. El buscador se conecta en el
        // siguiente efecto, una vez que "listo" ya hizo que React monte el
        // <input> de verdad -- si se conectaba aqui mismo, searchInputRef.current
        // todavia era null (el input esta condicionado a status === 'listo',
        // que recien se activa dos lineas mas abajo) y el Autocomplete nunca
        // se llegaba a crear. Asi fallaba en silencio: sin errores, sin
        // pac-container en el DOM, buscador con pinta de roto.
        setStatus('listo');
      })
      .catch(() => setStatus('sin_api_key'));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Conecta el buscador una vez que el <input> ya existe de verdad en el DOM
  // (status === 'listo' -> React ya monto el campo de busqueda).
  useEffect(() => {
    if (status !== 'listo' || !searchInputRef.current || !mapObjRef.current || !markerRef.current) return;
    const g = getGoogleMaps();
    if (!g.places) return;
    const map = mapObjRef.current;
    const marker = markerRef.current;
    const autocomplete = new g.places.Autocomplete(searchInputRef.current, {
      componentRestrictions: { country: 'pe' },
      fields: ['geometry', 'name'],
    });
    autocomplete.bindTo('bounds', map);
    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      const loc = place.geometry?.location;
      if (!loc) return;
      const position = { lat: loc.lat(), lng: loc.lng() };
      map.panTo(position);
      map.setZoom(place.geometry?.viewport ? 14 : 16);
      marker.setPosition(position);
      marker.setVisible(true);
      onChangeRef.current(position.lat, position.lng);
    });
  }, [status]);

  // Si el valor llega/cambia desde afuera (ej. al abrir el picker con
  // coordenadas ya guardadas), reposiciona el pin sin recrear el mapa.
  useEffect(() => {
    if (status !== 'listo' || !markerRef.current || lat == null || lng == null) return;
    const position = { lat, lng };
    markerRef.current.setPosition(position);
    markerRef.current.setVisible(true);
    mapObjRef.current?.panTo(position);
  }, [lat, lng, status]);

  return (
    <div className={`relative ${heightClass} bg-bg rounded-lg overflow-hidden border border-border`}>
      <div ref={mapRef} className="absolute inset-0" />
      {status === 'listo' && (
        <div className="absolute top-2 left-2 right-2 flex items-center gap-1.5 bg-surface border border-border rounded-lg shadow px-2.5 py-1.5">
          <Search size={14} className="text-muted flex-shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Buscar lugar (ej. Juliaca)…"
            className="flex-1 min-w-0 text-sm text-t1 bg-transparent focus:outline-none placeholder:text-muted"
          />
        </div>
      )}
      {status === 'sin_api_key' && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg">
          <div className="text-center px-4">
            <MapPin size={20} className="mx-auto text-muted mb-1.5" />
            <p className="text-sm text-t2">Falta la clave de Google Maps en el entorno.</p>
          </div>
        </div>
      )}
      {status === 'listo' && lat == null && !locateError && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-surface border border-border rounded-lg shadow px-3 py-1.5 text-sm text-t2">
          Busca el lugar o haz clic en el mapa para marcar la ubicación exacta
        </div>
      )}
      {locateError && (
        <div className="absolute bottom-2 left-2 right-2 bg-danger/10 border border-danger/30 text-danger text-xs rounded-lg px-3 py-1.5">
          {locateError}
        </div>
      )}
    </div>
  );
}
