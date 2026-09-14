import { useEffect, useState } from 'react';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { fetchGpsAlerts, type GpsAlert, type GpsAlertType } from '../lib/operacion-api';

const REFRESH_MS = 20000;

// Nivel 1 (rojo, imposible de ignorar): algo malo esta pasando AHORA.
// Nivel 2 (ambar, visible pero mas discreto): señal a revisar, no una
// emergencia en curso. Mismo criterio para los 3 paneles (Admin/Socio/
// Conductor) -- la data ya viene filtrada por rol desde el backend
// (gps-alerts.controller.ts: Admin ve toda la flota, Socio/Conductor solo
// su propia unidad).
const URGENT_TYPES: GpsAlertType[] = ['BOTON_PANICO', 'POSIBLE_REMOLQUE', 'POSIBLE_ACCIDENTE', 'FUERA_DE_RUTA'];

const ALERT_LABEL: Record<GpsAlertType, string> = {
  BOTON_PANICO: 'Botón de pánico activado',
  POSIBLE_REMOLQUE: 'Posible remolque — motor apagado en movimiento',
  POSIBLE_ACCIDENTE: 'Posible accidente — unidad detenida tras ir en movimiento (no confirmado)',
  FUERA_DE_RUTA: 'Unidad fuera del corredor autorizado, con viaje activo',
  CORTE_ENERGIA: 'Corte de energía',
  DESCONEXION: 'Dispositivo GPS desconectado',
  MOVIMIENTO_SIN_VIAJE: 'Movimiento sin viaje activo',
  FALLA_REPORTADA: 'Falla de GPS reportada por el conductor',
};

/**
 * Banner de alertas GPS activas para las pantallas de Resumen/Inicio (12
 * sept 2026) -- antes esto solo vivia escondido en "Alertas GPS", habia que
 * navegar ahi para enterarse. Se degrada a no mostrar nada si no hay
 * alertas activas o si la cuenta no tiene GPS real -- nunca inventa un
 * estado de alerta.
 */
export default function GpsAlertBanner({ enabled = true }: { enabled?: boolean }) {
  const [alerts, setAlerts] = useState<GpsAlert[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const poll = () => {
      fetchGpsAlerts()
        .then(result => {
          if (cancelled) return;
          setAlerts(result.filter(a => a.status === 'NUEVA' || a.status === 'EN_REVISION'));
        })
        .catch(() => { /* se degrada a sin banner, nunca inventa una alerta */ });
    };
    poll();
    const id = setInterval(poll, REFRESH_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [enabled]);

  if (!enabled || alerts.length === 0) return null;

  const urgent = alerts.filter(a => URGENT_TYPES.includes(a.type));
  const regular = alerts.filter(a => !URGENT_TYPES.includes(a.type));

  return (
    <div className="space-y-2">
      {urgent.map(a => (
        <div key={a.id} className="flex items-start gap-3 p-4 bg-danger text-white rounded-lg animate-pulse">
          <ShieldAlert size={20} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">🆘 {ALERT_LABEL[a.type]} — Unidad {a.unitCode}</p>
            <p className="text-sm opacity-90 mt-0.5">{a.description}</p>
          </div>
        </div>
      ))}
      {regular.map(a => (
        <div key={a.id} className="flex items-start gap-3 p-3.5 bg-warn/10 border border-warn/30 rounded-lg">
          <AlertTriangle size={18} className="flex-shrink-0 mt-0.5 text-warn" />
          <div>
            <p className="text-sm font-semibold text-t1">{ALERT_LABEL[a.type]} — Unidad {a.unitCode}</p>
            <p className="text-sm text-t2 mt-0.5">{a.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
