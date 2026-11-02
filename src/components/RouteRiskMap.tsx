import { useEffect, useRef, useState } from 'react';
import { createMap, fitToTerminals, L } from '../lib/map';
import type { RouteRiskPoint, OperationalConfig } from '../lib/operacion-api';

// Mapa de riesgo de ruta (docs/planes/ia-aplicada.md §3.2) -- cada punto es un
// circulo cuyo tamano y color reflejan cuantos eventos (frenadas bruscas +
// paradas anomalas) se agruparon ahi, nunca una posicion en vivo. Mismo
// patron de mapa que LiveFleetMap.tsx.
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
  const [ready, setReady] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObjRef = useRef<L.Map | null>(null);
  const circlesRef = useRef<L.Circle[]>([]);

  useEffect(() => {
    if (!mapRef.current) return;
    const map = createMap(mapRef.current);
    mapObjRef.current = map;
    setReady(true);
    return () => {
      map.remove();
      mapObjRef.current = null;
      circlesRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!config || !ready || !mapObjRef.current) return;
    fitToTerminals(mapObjRef.current, config, 60);
  }, [config, ready]);

  useEffect(() => {
    const map = mapObjRef.current;
    if (!ready || !map || !points) return;

    circlesRef.current.forEach((c) => c.remove());
    circlesRef.current = [];

    const maxEvents = points.reduce((max, p) => Math.max(max, p.totalEvents), 0);

    for (const p of points) {
      const color = severityColor(p.totalEvents, maxEvents);
      const circle = L.circle([p.lat, p.lng], {
        radius: 60 + p.totalEvents * 25, // metros -- crece con la cantidad de eventos agrupados
        fillColor: color,
        fillOpacity: 0.35,
        color,
        opacity: 0.9,
        weight: 2,
      }).addTo(map);
      circle.bindPopup(
        `<div style="font-family:sans-serif;font-size:13px;line-height:1.5">` +
          `<b>${p.totalEvents} evento(s)</b><br/>` +
          `${p.harshBrakingCount} frenada(s) brusca(s) · ${p.anomalousStopCount} parada(s) anómala(s)<br/>` +
          `Última vez: ${new Date(p.lastSeen).toLocaleString('es-PE')}` +
        `</div>`,
      );
      circlesRef.current.push(circle);
    }
  }, [points, ready]);

  return (
    <div className={`relative isolate ${heightClass} bg-bg`}>
      <div ref={mapRef} className="absolute inset-0" />
      {ready && (points?.length ?? 0) === 0 && (
        <div className="absolute z-[1000] bottom-2 left-1/2 -translate-x-1/2 bg-surface border border-border rounded-lg shadow px-3 py-1.5 text-sm text-t2 text-center max-w-[90%]">
          Sin puntos de riesgo detectados en la ventana seleccionada.
        </div>
      )}
    </div>
  );
}
