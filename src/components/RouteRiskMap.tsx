import { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { loadGoogleMaps, getGoogleMaps } from '../lib/google-maps';
import type { RouteRiskPoint, OperationalConfig } from '../lib/operacion-api';

// Mapa de riesgo de ruta (docs/planes/ia-aplicada.md §3.2) -- cada punto es un
// circulo cuyo tamano y color reflejan cuantos eventos (frenadas bruscas +
// paradas anomalas) se agruparon ahi, nunca una posicion en vivo. Mismo
// patron de carga de Google Maps que LiveFleetMap.tsx.
interface RouteRiskMapProps {
  points: RouteRiskPoint[] | null;
  config: OperationalConfig | null;
  heightClass?: string;
}

function severityColor(totalEvents: number, max: number): string {
  const ratio = max > 0 ? totalEvents / max : 0;
  if (ratio >= 0.66) return '#b91c1c'; // rojo -- mas eventos agrupados aqui
  if (ratio >= 0.33) return '#d97706'; // ambar
  return '#ca8a04'; // amarillo -- el minimo que igual califico como punto de riesgo
}

export default function RouteRiskMap({ points, config, heightClass = 'h-72' }: RouteRiskMapProps) {
  const [mapStatus, setMapStatus] = useState<'cargando' | 'listo' | 'sin_api_key' | 'error'>('cargando');
  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapObjRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const infoWindowRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const circlesRef = useRef<any[]>([]);

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
    mapObjRef.current.fitBounds(bounds, 60);
  }, [config]);

  useEffect(() => {
    if (mapStatus !== 'listo' || !points) return;
    const g = getGoogleMaps();
    const map = mapObjRef.current;

    circlesRef.current.forEach((c) => c.setMap(null));
    circlesRef.current = [];

    const maxEvents = points.reduce((max, p) => Math.max(max, p.totalEvents), 0);

    for (const p of points) {
      const color = severityColor(p.totalEvents, maxEvents);
      const circle = new g.Circle({
        map,
        center: { lat: p.lat, lng: p.lng },
        radius: 60 + p.totalEvents * 25, // metros -- crece con la cantidad de eventos agrupados
        fillColor: color,
        fillOpacity: 0.35,
        strokeColor: color,
        strokeOpacity: 0.9,
        strokeWeight: 2,
        clickable: true,
      });
      circle.addListener('click', () => {
        infoWindowRef.current.setContent(
          `<div style="font-family:sans-serif;font-size:13px;line-height:1.5">` +
            `<b>${p.totalEvents} evento(s)</b><br/>` +
            `${p.harshBrakingCount} frenada(s) brusca(s) · ${p.anomalousStopCount} parada(s) anómala(s)<br/>` +
            `Última vez: ${new Date(p.lastSeen).toLocaleString('es-PE')}` +
          `</div>`,
        );
        infoWindowRef.current.setPosition({ lat: p.lat, lng: p.lng });
        infoWindowRef.current.open(map);
      });
      circlesRef.current.push(circle);
    }
  }, [points, mapStatus]);

  return (
    <div className={`relative ${heightClass} bg-bg`}>
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
      {mapStatus === 'listo' && (points?.length ?? 0) === 0 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-surface border border-border rounded-lg shadow px-3 py-1.5 text-sm text-t2 text-center max-w-[90%]">
          Sin puntos de riesgo detectados en la ventana seleccionada.
        </div>
      )}
    </div>
  );
}
