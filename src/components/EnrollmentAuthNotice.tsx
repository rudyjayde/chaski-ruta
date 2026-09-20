import { useCallback, useEffect, useState } from 'react';
import { Hourglass, XCircle } from 'lucide-react';
import { ENROLLMENT_AUTH_EVENT, fetchMyEnrollmentAuth, routeLabel, type MyEnrollmentAuth, type Organization } from '../lib/operacion-api';

const REFRESH_MS = 20000;

/**
 * Cartel del conductor cuando el sistema no pudo confirmar de donde viene su unidad (sin historial, o su
 * ultimo viaje no calza con el terminal donde esta) y su inscripcion espera al administrador, o fue
 * rechazada. Una autorizacion aprobada no ocupa espacio: llega a la campanita y basta con volver a presionar
 * Inscribirme.
 */
export default function EnrollmentAuthNotice({ org }: { org: Organization | null }) {
  const [state, setState] = useState<MyEnrollmentAuth | null>(null);

  const refresh = useCallback(async () => {
    try {
      setState(await fetchMyEnrollmentAuth());
    } catch {
      setState(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), REFRESH_MS);
    window.addEventListener(ENROLLMENT_AUTH_EVENT, refresh);
    return () => {
      window.clearInterval(id);
      window.removeEventListener(ENROLLMENT_AUTH_EVENT, refresh);
    };
  }, [refresh]);

  const req = state?.request;
  if (!req) return null;
  const route = org ? routeLabel(req.route, org) : '';
  const why = req.type === 'SIN_HISTORIAL'
    ? 'tu unidad todavía no tiene viajes registrados'
    : 'tu último viaje no coincide con el terminal donde estás';

  if (req.status === 'PENDIENTE') {
    return (
      <div className="border border-warn/40 bg-warn/5 rounded-lg p-4 flex items-start gap-3">
        <Hourglass size={18} className="text-warn mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-t1">Tu inscripción espera la autorización del administrador</p>
          <p className="text-xs text-t2 mt-0.5">
            El sistema no pudo confirmar de dónde viene tu unidad ({why}). Ya le avisamos al administrador{route ? ` para inscribirte en ${route}` : ''}. Cuando la autorice te llega un aviso en la campanita y presionas Inscribirme otra vez.
          </p>
        </div>
      </div>
    );
  }

  if (req.status === 'RECHAZADO') {
    return (
      <div className="border border-danger/40 bg-danger/5 rounded-lg p-4 flex items-start gap-3">
        <XCircle size={18} className="text-danger mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-t1">Tu administrador rechazó tu inscripción</p>
          <p className="text-xs text-t2 mt-0.5">
            {req.resolutionReason ? `Motivo: ${req.resolutionReason}. ` : ''}Comunícate con él. Si lo necesitas, puedes volver a intentar inscribirte.
          </p>
        </div>
      </div>
    );
  }

  return null;
}
