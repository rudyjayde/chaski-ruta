import { useState } from 'react';
import { CheckCircle, AlertCircle } from 'lucide-react';
import { useAdminDemo } from './AdminApp';

// Modulos reales por plan -- coincide con como AdminApp.tsx arma la
// navegacion (BASE_NAV siempre, GPS_NAV + Asistente IA solo si isPRO). Nunca
// una lista fija sin relacion con lo que la asociacion realmente ve.
const BASE_MODULES = ['Colas', 'Manifiestos', 'Viajes', 'Reubicaciones', 'Flota', 'Reportes', 'Auditoría', 'Avisos'];
const PRO_MODULES = ['GPS en vivo', 'Historial GPS', 'Dispositivos GPS', 'Alertas GPS', 'Mapa de riesgo', 'Asistente IA', 'Recaudación por empresa'];

// (13 sept 2026, decidido con Jayde) -- esta pantalla se llamaba
// "Configuración" y tenia 11 secciones; 10 de esas 11 eran o bien maqueta
// pura (Cola, Tarifas, Evidencia, Reubicaciones, Notificaciones -- estado
// local que ni siquiera llamaba al backend, con un mensaje de "guardado y
// registrado en auditoría" que era falso) o un espejo de solo lectura de
// algo que ya se administra mejor en otro lado (Terminales/Tiempo de
// llamado -- Super Admin -> Editar asociación -> Operación; Administradores
// -- Personas -> Administradores, que ademas SI permite invitar). Se
// eliminaron todas. Plan y módulos es la única con valor real y único: ver
// el plan actual, que modulos incluye, y pedir el upgrade a PRO.
function PlanSection() {
  const { org, isPRO } = useAdminDemo();
  const [showProRequest, setShowProRequest] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [reason, setReason] = useState('');

  if (showProRequest && !submitted) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <button onClick={() => setShowProRequest(false)} className="text-sm text-t2 hover:text-t1">← Volver</button>
        </div>
        <h3 className="text-base font-semibold text-t1">Solicitar plan PRO</h3>
        <p className="text-sm text-t2">La activación del plan PRO la realiza exclusivamente el Super Admin de CHASKI AI. Esta solicitud es informativa.</p>
        <div>
          <label className="block text-sm font-medium text-t1 mb-1">Motivo / necesidad <span className="text-danger">*</span></label>
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Describe por qué necesitas el plan PRO…" className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
        </div>
        <div>
          <label className="block text-sm font-medium text-t1 mb-1">Número de unidades con GPS</label>
          <input type="number" min="0" placeholder="Ej. 20" className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
        <div className="p-3 bg-warn/5 border border-warn/20 rounded-lg text-sm text-warn flex items-start gap-2">
          <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
          Solo el Super Admin de CHASKI AI puede aprobar el pago y activar el plan. Tú no puedes activarlo desde aquí.
        </div>
        <div className="flex gap-3 justify-end">
          <button onClick={() => setShowProRequest(false)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-hover">Cancelar</button>
          <button onClick={() => { if (reason) setSubmitted(true); }} disabled={!reason} className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-h disabled:opacity-50">
            Enviar solicitud
          </button>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="text-center py-8">
        <CheckCircle size={36} className="text-ok mx-auto mb-3" />
        <p className="text-sm font-semibold text-t1 mb-1">Solicitud enviada</p>
        <p className="text-sm text-t2 mb-4">CHASKI AI se comunicará para preparar la propuesta. No puedes activar PRO desde aquí.</p>
        <button
          onClick={() => { setSubmitted(false); setShowProRequest(false); setReason(''); }}
          className="px-3 py-1.5 text-sm font-medium text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors"
        >
          Volver al plan actual
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${isPRO ? 'text-primary bg-primary/10' : 'text-t2 bg-t2/10'}`}>
            Plan {isPRO ? 'PRO' : 'Operación'}
          </span>
          {org && <span className="text-sm text-ok font-medium">ACTIVO</span>}
        </div>
        <p className="text-sm text-t2">
          {isPRO
            ? `${org?.name ?? 'Tu asociación'} tiene el Plan PRO: incluye GPS en vivo, historial, alertas y asistente de IA para toda la flota equipada.`
            : `${org?.name ?? 'Tu asociación'} está en el Plan Operación. Las unidades con GPS Vehicular contratado individualmente igual pueden ver su propio GPS desde Flota.`}
        </p>
      </div>

      <div>
        <p className="text-sm font-semibold text-t2 mb-2">Módulos incluidos</p>
        <div className="flex flex-wrap gap-1.5">
          {[...BASE_MODULES, ...(isPRO ? PRO_MODULES : [])].map(m => (
            <span key={m} className="text-[11px] px-2 py-0.5 rounded bg-ok/10 text-ok">{m}</span>
          ))}
        </div>
      </div>

      <div className="p-4 bg-bg border border-border rounded-lg text-sm text-t2">
        <p className="font-medium text-t1 mb-1">Facturación y vigencia</p>
        <p>Los datos de facturación, vigencia y cantidad de unidades contratadas todavía no están disponibles en la plataforma. Consulta el detalle de tu contrato directamente con CHASKI AI.</p>
      </div>

      <button
        onClick={() => setShowProRequest(true)}
        className="w-full h-9 border border-primary text-primary rounded-lg text-sm hover:bg-primary/5 font-medium"
      >
        Solicitar PRO / Cambio de plan
      </button>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div className="p-6 lg:p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-t1 mb-1">Plan y módulos</h1>
      <p className="text-sm text-t2 mb-4">Tu plan actual, qué módulos incluye, y cómo pedir un cambio.</p>
      <PlanSection />
      <p className="text-sm text-muted mt-6">Los cambios de plan quedan registrados en auditoría.</p>
    </div>
  );
}
