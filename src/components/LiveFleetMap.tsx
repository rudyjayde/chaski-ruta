import { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { loadGoogleMaps, getGoogleMaps } from '../lib/google-maps';
import { routeLabel, type LiveVehiclePosition, type OperationalConfig, type Organization } from '../lib/operacion-api';

// Mapa real de flota en vivo (Google Maps + posiciones de Traccar) --
// extraido de GPSLivePage.tsx para poder mostrar el MISMO mapa real (no una
// imitacion) tanto en la pantalla completa "GPS en vivo" como en el resumen
// del Centro de Operaciones (Inicio). Nunca dibuja una posicion inventada:
// una unidad sin fix real simplemente no aparece.
export const ROUTE_COLOR: Record<'JULI_PUNO' | 'PUNO_JULI', string> = {
  JULI_PUNO: '#1f4fd8',
  PUNO_JULI: '#0f9d58',
};
const IDLE_COLOR = '#8b8677';

interface LiveFleetMapProps {
  positions: LiveVehiclePosition[] | null;
  config: OperationalConfig | null;
  org: Organization | null;
  heightClass?: string;
  // Version reducida (para el widget del Inicio) -- mismo mapa, mensajes de
  // estado mas chicos para que quepan en un recuadro pequeno.
  compact?: boolean;
}

export default function LiveFleetMap({ positions, config, org, heightClass = 'h-72', compact = false }: LiveFleetMapProps) {
  const [mapStatus, setMapStatus] = useState<'cargando' | 'listo' | 'sin_api_key' | 'error'>('cargando');

  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapObjRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const infoWindowRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<Map<string, any>>(new Map());

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then(() => {
        if (cancelled || !mapRef.current) return;
        const g = getGoogleMaps();
        mapObjRef.current = new g.Map(mapRef.current, {
          zoom: 10,
          center: { lat: -16.02, lng: -69.74 },
          disableDefaultUI: true,
          zoomControl: true,
          streetViewControl: false,
        });
        infoWindowRef.current = new g.InfoWindow();
        setMapStatus('listo');
      })
      .catch(() => setMapStatus('sin_api_key'));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!config || !mapObjRef.current) return;
    const g = getGoogleMaps();
    const bounds = new g.LatLngBounds();
    bounds.extend({ lat: config.terminalOriginLat, lng: config.terminalOriginLng });
    bounds.extend({ lat: config.terminalDestinationLat, lng: config.terminalDestinationLng });
    mapObjRef.current.fitBounds(bounds, compact ? 24 : 80);
  }, [config, compact]);

  // Sincroniza los marcadores del mapa con las posiciones recibidas.
  useEffect(() => {
    if (mapStatus !== 'listo' || !positions) return;
    const g = getGoogleMaps();
    const map = mapObjRef.current;
    const seen = new Set<string>();

    for (const p of positions) {
      seen.add(p.vehicleId);
      const color = p.route ? ROUTE_COLOR[p.route] : IDLE_COLOR;
      const icon = { path: g.SymbolPath.CIRCLE, scale: compact ? 10 : 14, fillColor: color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 };
      const position = { lat: p.lat, lng: p.lng };
      let marker = markersRef.current.get(p.vehicleId);
      if (!marker) {
        marker = new g.Marker({
          map,
          position,
          icon,
          label: { text: p.code, color: '#fff', fontSize: compact ? '9px' : '11px', fontWeight: '700' },
        });
        marker.addListener('click', () => {
          infoWindowRef.current.setContent(
            `<div style="font-family:sans-serif;font-size:13px;line-height:1.5">` +
              `<b>Unidad ${p.code}</b><br/>${p.companyName}<br/>` +
              `${p.route ? routeLabel(p.route, org) : 'Sin ruta activa'}<br/>` +
              `${p.speedKmh} km/h &middot; actualizado ${new Date(p.lastUpdate).toLocaleTimeString('es-PE')}` +
            `</div>`,
          );
          infoWindowRef.current.open(map, marker);
        });
        markersRef.current.set(p.vehicleId, marker);
      } else {
        marker.setPosition(position);
        marker.setIcon(icon);
      }
    }

    for (const [id, marker] of markersRef.current.entries()) {
      if (!seen.has(id)) {
        marker.setMap(null);
        markersRef.current.delete(id);
      }
    }
  }, [positions, mapStatus, org, compact]);

  return (
    <div className={`relative ${heightClass} bg-bg`}>
      <div ref={mapRef} className="absolute inset-0" />
      {mapStatus === 'sin_api_key' && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg">
          <div className="text-center max-w-sm px-4">
            <MapPin size={compact ? 16 : 22} className="mx-auto text-muted mb-1.5" />
            <p className={compact ? 'text-sm text-t1 font-medium' : 'text-sm text-t1 font-medium'}>Mapa en configuración</p>
            {!compact && <p className="text-sm text-t2 mt-1">Falta la clave de Google Maps (VITE_GOOGLE_MAPS_API_KEY) en el entorno.</p>}
          </div>
        </div>
      )}
      {mapStatus === 'listo' && (positions?.length ?? 0) === 0 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-surface border border-border rounded-lg shadow px-3 py-1.5 text-sm text-t2 text-center max-w-[90%]">
          {compact
            ? 'Ninguna unidad con señal GPS ahora'
            : 'Ninguna unidad tiene un dispositivo GPS vinculado todavía — configúralo desde Unidades y flota.'}
        </div>
      )}
    </div>
  );
}
