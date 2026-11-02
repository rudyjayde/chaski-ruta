import { useEffect, useRef, useState } from 'react';
import { createMap, dotIcon, escapeHtml, fitToTerminals, L } from '../lib/map';
import { routeLabel, type LiveVehiclePosition, type OperationalConfig, type Organization } from '../lib/operacion-api';

// Mapa real de flota en vivo (OpenStreetMap + posiciones de Traccar) --
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

function popupHtml(p: LiveVehiclePosition, org: Organization | null): string {
  return (
    `<div style="font-family:sans-serif;font-size:13px;line-height:1.5">` +
      `<b>Unidad ${escapeHtml(p.code)}</b><br/>${escapeHtml(p.companyName)}<br/>` +
      `${p.route ? escapeHtml(routeLabel(p.route, org)) : 'Sin ruta activa'}<br/>` +
      `${p.speedKmh} km/h &middot; actualizado ${new Date(p.lastUpdate).toLocaleTimeString('es-PE')}` +
    `</div>`
  );
}

export default function LiveFleetMap({ positions, config, org, heightClass = 'h-72', compact = false }: LiveFleetMapProps) {
  const [ready, setReady] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObjRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());

  useEffect(() => {
    if (!mapRef.current) return;
    const map = createMap(mapRef.current);
    mapObjRef.current = map;
    setReady(true);
    return () => {
      map.remove();
      mapObjRef.current = null;
      markersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!config || !ready || !mapObjRef.current) return;
    fitToTerminals(mapObjRef.current, config, compact ? 24 : 80);
  }, [config, compact, ready]);

  // Sincroniza los marcadores del mapa con las posiciones recibidas.
  useEffect(() => {
    const map = mapObjRef.current;
    if (!ready || !map || !positions) return;
    const seen = new Set<string>();

    for (const p of positions) {
      seen.add(p.vehicleId);
      const color = p.route ? ROUTE_COLOR[p.route] : IDLE_COLOR;
      const icon = dotIcon(color, compact ? 20 : 28, p.code, compact ? 9 : 11);
      let marker = markersRef.current.get(p.vehicleId);
      if (!marker) {
        marker = L.marker([p.lat, p.lng], { icon }).addTo(map);
        markersRef.current.set(p.vehicleId, marker);
      } else {
        marker.setLatLng([p.lat, p.lng]);
        marker.setIcon(icon);
      }
      marker.bindPopup(popupHtml(p, org));
    }

    for (const [id, marker] of markersRef.current.entries()) {
      if (!seen.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }
  }, [positions, ready, org, compact]);

  return (
    <div className={`relative isolate ${heightClass} bg-bg`}>
      <div ref={mapRef} className="absolute inset-0" />
      {ready && (positions?.length ?? 0) === 0 && (
        <div className="absolute z-[1000] bottom-2 left-1/2 -translate-x-1/2 bg-surface border border-border rounded-lg shadow px-3 py-1.5 text-sm text-t2 text-center max-w-[90%]">
          {compact
            ? 'Ninguna unidad con señal GPS ahora'
            : 'Ninguna unidad tiene un dispositivo GPS vinculado todavía — configúralo desde Unidades y flota.'}
        </div>
      )}
    </div>
  );
}
