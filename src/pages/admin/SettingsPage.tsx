import { useState, useEffect, useCallback } from 'react';
import {
  Building2, Clock, Route, ListOrdered, DollarSign, Timer,
  FileCheck, ArrowLeftRight, Bell, Shield, CreditCard, CheckCircle, AlertCircle, Loader2,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { fetchOperationalConfig, updateOperationalConfig, type OperationalConfig } from '../../lib/operacion-api';
import TerminalMapPicker from '../../components/TerminalMapPicker';

type SettingSection =
  | 'organizacion' | 'terminales' | 'rutas' | 'cola' | 'tarifas'
  | 'tiempo-llamado' | 'evidencia' | 'reubicaciones' | 'notificaciones'
  | 'administradores' | 'plan';

interface NavEntry { id: SettingSection; label: string; icon: React.ElementType; }

const NAV: NavEntry[] = [
  { id: 'organizacion', label: 'Organización', icon: Building2 },
  { id: 'terminales', label: 'Terminales', icon: Clock },
  { id: 'rutas', label: 'Rutas', icon: Route },
  { id: 'cola', label: 'Reglas de cola', icon: ListOrdered },
  { id: 'tarifas', label: 'Tarifas', icon: DollarSign },
  { id: 'tiempo-llamado', label: 'Tiempo tras llamado', icon: Timer },
  { id: 'evidencia', label: 'Reglas de evidencia', icon: FileCheck },
  { id: 'reubicaciones', label: 'Reubicaciones', icon: ArrowLeftRight },
  { id: 'notificaciones', label: 'Notificaciones', icon: Bell },
  { id: 'administradores', label: 'Administradores y permisos', icon: Shield },
  { id: 'plan', label: 'Plan y módulos', icon: CreditCard },
];

function SaveConfirm({ onSave, onCancel, label }: { onSave: () => void; onCancel: () => void; label: string }) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
      <div className="bg-surface rounded-lg shadow-xl w-full max-w-sm p-6">
        <h3 className="text-base font-semibold text-t1 mb-1">Confirmar cambio</h3>
        <p className="text-sm text-t2 mb-3">{label}</p>
        <div className="mb-4">
          <label className="block text-sm font-medium text-t1 mb-1">Motivo <span className="text-danger">*</span></label>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Describe el motivo del cambio…" className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-hover">Cancelar</button>
          <button onClick={onSave} disabled={!reason} className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-h disabled:opacity-50">
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldGroup({ title, fields }: { title: string; fields: { label: string; value: string; type?: string }[] }) {
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(fields.map(f => [f.label, f.value])));
  const [dirty, setDirty] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setDirty(false);
    setShowConfirm(false);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <>
      <div className="bg-surface border border-border rounded-lg overflow-hidden mb-4">
        <div className="px-5 py-3.5 border-b border-border bg-bg">
          <h3 className="text-sm font-semibold text-t2 uppercase tracking-wide">{title}</h3>
        </div>
        <div className="p-4 space-y-3">
          {saved && (
            <div className="flex items-center gap-2 p-2.5 bg-ok/5 border border-ok/30 rounded-lg text-sm text-ok">
              <CheckCircle size={12} />
              Cambios guardados y registrados en auditoría.
            </div>
          )}
          {fields.map(f => (
            <div key={f.label}>
              <label className="block text-sm font-medium text-t1 mb-1">{f.label}</label>
              <input
                type={f.type ?? 'text'}
                value={values[f.label]}
                onChange={e => { setValues(v => ({ ...v, [f.label]: e.target.value })); setDirty(true); setSaved(false); }}
                className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          ))}
          {dirty && (
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => { setValues(Object.fromEntries(fields.map(f => [f.label, f.value]))); setDirty(false); }} className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-hover">
                Descartar
              </button>
              <button onClick={() => setShowConfirm(true)} className="px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary-h">
                Guardar cambios
              </button>
            </div>
          )}
        </div>
      </div>
      {showConfirm && (
        <SaveConfirm label={`Modificar sección "${title}"`} onSave={handleSave} onCancel={() => setShowConfirm(false)} />
      )}
    </>
  );
}

function ToggleField({ label, description, initial }: { label: string; description?: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pending, setPending] = useState(on);

  const handleToggle = (v: boolean) => {
    setPending(v);
    setShowConfirm(true);
  };

  const handleSave = () => {
    setOn(pending);
    setShowConfirm(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <>
      <div className="flex items-center justify-between p-4 border border-border rounded-lg mb-2">
        <div>
          <p className="text-sm font-medium text-t1">{label}</p>
          {description && <p className="text-sm text-t2 mt-0.5">{description}</p>}
          {saved && <p className="text-sm text-ok mt-1">Guardado correctamente.</p>}
        </div>
        <button
          onClick={() => handleToggle(!on)}
          className={`relative w-10 h-6 rounded-full transition-colors ${on ? 'bg-primary' : 'bg-border'}`}
          role="switch"
          aria-checked={on}
        >
          <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${on ? 'translate-x-4' : ''}`} />
        </button>
      </div>
      {showConfirm && (
        <SaveConfirm label={`${pending ? 'Activar' : 'Desactivar'}: ${label}`} onSave={handleSave} onCancel={() => setShowConfirm(false)} />
      )}
    </>
  );
}

function PlanSection() {
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
          <div>
            <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded uppercase">Plan PRO</span>
          </div>
          <span className="text-sm text-ok font-medium">ACTIVO</span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {[
            { label: 'Vigencia', value: '1 ene 2026 — 31 dic 2026' },
            { label: 'Unidades', value: '60 (GPS: 20)' },
            { label: 'Período', value: 'Anual' },
            { label: 'Estado de pago', value: 'Aprobado' },
          ].map(r => (
            <div key={r.label}>
              <p className="text-t2">{r.label}</p>
              <p className="font-medium text-t1 mt-0.5">{r.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold text-t2 mb-2">Módulos activos</p>
        <div className="flex flex-wrap gap-1.5">
          {['Colas', 'Manifiestos', 'Viajes', 'Reubicaciones', 'Flota', 'Reportes', 'Auditoría', 'GPS en vivo', 'Historial GPS', 'Dispositivos GPS', 'Alertas GPS'].map(m => (
            <span key={m} className="text-[11px] px-2 py-0.5 rounded bg-ok/10 text-ok">{m}</span>
          ))}
        </div>
      </div>

      <div className="p-4 bg-bg border border-border rounded-lg text-sm text-t2">
        <p className="font-medium text-t1 mb-1">Gestión del plan</p>
        <p>La activación y renovación del plan corresponde al Super Admin de CHASKI AI. Si necesitas cambios, envía una solicitud.</p>
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

// Terminal origen/destino del corredor de esta asociacion -- unica seccion de
// Configuracion conectada a datos reales por ahora (OperationalConfig real,
// backend/src/operational-config). El resto de "Configuración" sigue siendo
// una maqueta (ver comentario en SettingsPage) -- se va conectando pantalla
// por pantalla, como el resto del sistema.
function TerminalesSection() {
  const { user } = useAuth();
  const canEdit = user?.role === 'superadmin';

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState<{
    originName: string; originAddress: string; originLat: number | null; originLng: number | null;
    destName: string; destAddress: string; destLat: number | null; destLng: number | null;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError('');
    fetchOperationalConfig()
      .then(c => {
        setForm({
          originName: c.terminalOriginName,
          originAddress: c.terminalOriginAddress ?? '',
          originLat: c.terminalOriginLat,
          originLng: c.terminalOriginLng,
          destName: c.terminalDestinationName,
          destAddress: c.terminalDestinationAddress ?? '',
          destLat: c.terminalDestinationLat,
          destLng: c.terminalDestinationLng,
        });
      })
      .catch(err => setLoadError(err instanceof Error ? err.message : 'No se pudo cargar la configuración de terminales'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    setSaveError('');
    try {
      await updateOperationalConfig({
        terminalOriginName: form.originName.trim(),
        terminalOriginAddress: form.originAddress.trim() || undefined,
        ...(form.originLat != null && form.originLng != null ? { terminalOriginLat: form.originLat, terminalOriginLng: form.originLng } : {}),
        terminalDestinationName: form.destName.trim(),
        terminalDestinationAddress: form.destAddress.trim() || undefined,
        ...(form.destLat != null && form.destLng != null ? { terminalDestinationLat: form.destLat, terminalDestinationLng: form.destLng } : {}),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-t2"><Loader2 size={14} className="animate-spin" /> Cargando…</div>;
  }
  if (loadError || !form) {
    return <div className="bg-danger/10 text-danger text-sm px-3 py-2.5 rounded-lg flex items-center gap-2"><AlertCircle size={13} /> {loadError || 'No se pudo cargar'}</div>;
  }

  const TerminalForm = ({
    title, name, address, lat, lng, onName, onAddress, onCoords,
  }: {
    title: string; name: string; address: string; lat: number | null; lng: number | null;
    onName: (v: string) => void; onAddress: (v: string) => void; onCoords: (lat: number, lng: number) => void;
  }) => (
    <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-semibold text-t1">{title}</h3>
      <div>
        <label className="block text-sm font-medium text-t2 mb-1">Nombre</label>
        <input
          value={name}
          onChange={e => onName(e.target.value)}
          disabled={!canEdit}
          className="w-full h-9 px-3 border border-border rounded-lg text-sm disabled:bg-bg disabled:text-t2 focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-t2 mb-1">Dirección (referencial)</label>
        <input
          value={address}
          onChange={e => onAddress(e.target.value)}
          disabled={!canEdit}
          placeholder="Ej. Av. Circunvalación s/n"
          className="w-full h-9 px-3 border border-border rounded-lg text-sm disabled:bg-bg disabled:text-t2 focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-t2 mb-1">Ubicación en el mapa</label>
        {canEdit ? (
          <TerminalMapPicker lat={lat} lng={lng} onChange={onCoords} />
        ) : (
          <div className="h-40 rounded-lg border border-border bg-bg flex items-center justify-center text-sm text-t2">
            Solo Super Admin puede cambiar la ubicación
          </div>
        )}
        <p className="text-sm text-t2 mt-1.5 font-mono">
          {lat != null && lng != null ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : 'Sin ubicación marcada todavía'}
        </p>
      </div>
    </div>
  );

  return (
    <>
      <h2 className="text-base font-semibold text-t1 mb-1">Terminales</h2>
      <p className="text-sm text-t2 mb-4">
        El origen y destino del corredor de tu asociación — esta ubicación es la que se usa para la verificación de llegada por GPS y para centrar el mapa en vivo.
      </p>
      {!canEdit && (
        <div className="mb-4 px-3 py-2.5 bg-bg border border-border rounded-lg text-sm text-t2">
          Solo Super Admin puede editar los terminales. Si algo está mal, contacta al equipo de CHASKI AI.
        </div>
      )}
      <div className="space-y-4">
        <TerminalForm
          title="Terminal de origen (ruta de ida)"
          name={form.originName} address={form.originAddress} lat={form.originLat} lng={form.originLng}
          onName={v => setForm(f => f && { ...f, originName: v })}
          onAddress={v => setForm(f => f && { ...f, originAddress: v })}
          onCoords={(lat, lng) => setForm(f => f && { ...f, originLat: lat, originLng: lng })}
        />
        <TerminalForm
          title="Terminal de destino (ruta de vuelta)"
          name={form.destName} address={form.destAddress} lat={form.destLat} lng={form.destLng}
          onName={v => setForm(f => f && { ...f, destName: v })}
          onAddress={v => setForm(f => f && { ...f, destAddress: v })}
          onCoords={(lat, lng) => setForm(f => f && { ...f, destLat: lat, destLng: lng })}
        />
      </div>
      {saveError && <div className="mt-3 bg-danger/10 text-danger text-sm px-3 py-2.5 rounded-lg">{saveError}</div>}
      {canEdit && (
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="h-9 px-4 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
            {saving ? 'Guardando…' : 'Guardar terminales'}
          </button>
          {saved && <span className="text-sm text-ok flex items-center gap-1.5"><CheckCircle size={14} /> Guardado</span>}
        </div>
      )}
    </>
  );
}

export default function SettingsPage() {
  const [active, setActive] = useState<SettingSection>('organizacion');

  const renderContent = () => {
    switch (active) {
      case 'organizacion':
        return (
          <>
            <h2 className="text-base font-semibold text-t1 mb-4">Organización</h2>
            <FieldGroup title="Datos de la organización" fields={[
              { label: 'Nombre', value: 'ATIPCAR' },
              { label: 'RUC', value: '20601000001' },
              { label: 'Correo institucional', value: 'contacto@atipcar.test' },
              { label: 'Teléfono', value: '(054) 234567' },
            ]} />
          </>
        );
      case 'terminales':
        return <TerminalesSection />;
      case 'rutas':
        return (
          <>
            <h2 className="text-base font-semibold text-t1 mb-4">Rutas</h2>
            <div className="bg-surface border border-border rounded-lg divide-y divide-border">
              {[
                { name: 'Juli → Puno', distance: '95 km', time: '2h 30min', status: 'Activa' },
                { name: 'Puno → Juli', distance: '95 km', time: '2h 30min', status: 'Activa' },
              ].map(r => (
                <div key={r.name} className="px-5 py-3.5 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-t1">{r.name}</p>
                    <p className="text-sm text-t2 mt-0.5">{r.distance} · {r.time}</p>
                  </div>
                  <span className="text-xs bg-ok/10 text-ok px-2 py-0.5 rounded">{r.status}</span>
                </div>
              ))}
            </div>
          </>
        );
      case 'cola':
        return (
          <>
            <h2 className="text-base font-semibold text-t1 mb-4">Reglas de cola</h2>
            <FieldGroup title="Parámetros FIFO" fields={[
              { label: 'Capacidad máxima de cola Juli→Puno', value: '40' },
              { label: 'Capacidad máxima de cola Puno→Juli', value: '40' },
              { label: 'Tiempo de gracia tras llamado (min)', value: '10' },
            ]} />
            <ToggleField label="FIFO estricto" description="No permite alterar el orden de la cola salvo excepciones con motivo." initial={true} />
            <ToggleField label="Alerta por cola vacía" description="Notifica al administrador cuando la cola queda sin unidades." initial={true} />
          </>
        );
      case 'tarifas':
        return (
          <>
            <h2 className="text-base font-semibold text-t1 mb-4">Tarifas</h2>
            <div className="p-4 bg-warn/5 border border-warn/20 rounded-lg text-sm text-warn mb-4 flex items-start gap-2">
              <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
              Los cambios de tarifa requieren motivo y se registran en auditoría.
            </div>
            <FieldGroup title="Tarifas base" fields={[
              { label: 'Tarifa Juli → Puno (S/)', value: '10.00' },
              { label: 'Tarifa Puno → Juli (S/)', value: '10.00' },
              { label: 'Tarifa Pomata → Puno (S/)', value: '7.00' },
            ]} />
          </>
        );
      case 'tiempo-llamado':
        return (
          <>
            <h2 className="text-base font-semibold text-t1 mb-4">Tiempo tras llamado</h2>
            <FieldGroup title="Tiempo de espera" fields={[
              { label: 'Minutos para presentarse al llamado', value: '10' },
              { label: 'Reintentos antes de marcar AUSENTE', value: '1' },
            ]} />
          </>
        );
      case 'evidencia':
        return (
          <>
            <h2 className="text-base font-semibold text-t1 mb-4">Reglas de evidencia</h2>
            <ToggleField label="Requerir evidencia para inscripción" description="El conductor debe registrar presencia desde la app o el kiosco." initial={true} />
            <ToggleField label="Aceptar registro móvil sin foto" description="Si está desactivado, se requiere foto del vehículo o la placa." initial={true} />
            <ToggleField label="Verificación GPS PRO como evidencia automática" description="Solo aplica si el plan PRO está activo." initial={true} />
          </>
        );
      case 'reubicaciones':
        return (
          <>
            <h2 className="text-base font-semibold text-t1 mb-4">Reubicaciones</h2>
            <FieldGroup title="Parámetros de reubicación" fields={[
              { label: 'Umbral de desequilibrio para alerta (unidades)', value: '5' },
              { label: 'Ventana de traslado (horas)', value: '07:30 – 09:00' },
            ]} />
            <ToggleField label="Propuesta automática al detectar desequilibrio" description="El sistema sugiere una reubicación; el administrador autoriza." initial={true} />
          </>
        );
      case 'notificaciones':
        return (
          <>
            <h2 className="text-base font-semibold text-t1 mb-4">Notificaciones</h2>
            <ToggleField label="Alertas a administradores" description="Recibir alertas de cola, incidencias y reubicaciones." initial={true} />
            <ToggleField label="Notificaciones a conductores" description="Enviar llamado y estado de cola al dispositivo del conductor." initial={true} />
            <ToggleField label="Resumen diario" description="Reporte automático al cierre de jornada." initial={false} />
            <ToggleField label="Alertas GPS PRO" description="Notificaciones de desconexión, desvío y pérdida de señal." initial={true} />
          </>
        );
      case 'administradores':
        return (
          <>
            <h2 className="text-base font-semibold text-t1 mb-4">Administradores y permisos</h2>
            <div className="bg-surface border border-border rounded-lg divide-y divide-border mb-4">
              <div className="px-5 py-3.5">
                <p className="text-sm font-medium text-t1">Rosa Huanca Flores</p>
                <p className="text-sm text-t2 mt-0.5">Gerente / Administrador principal · admin@acceso.atipcar.test</p>
                <span className="text-[11px] bg-primary/10 text-primary px-1.5 py-0.5 rounded mt-1 inline-block">Acceso completo</span>
              </div>
            </div>
            <div className="p-4 bg-bg border border-border rounded-lg text-sm text-t2">
              Los administradores auxiliares se invitan desde Personas → Administradores. Sus permisos son limitados por sección. Ninguno puede crear Super Admin.
            </div>
          </>
        );
      case 'plan':
        return (
          <>
            <h2 className="text-base font-semibold text-t1 mb-4">Plan y módulos</h2>
            <PlanSection />
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex h-full">
      {/* Left nav */}
      <nav className="w-56 flex-shrink-0 border-r border-border bg-surface overflow-auto py-3" aria-label="Secciones de configuración">
        {NAV.map(item => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setActive(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors relative ${
                active === item.id
                  ? 'bg-selected text-primary font-medium'
                  : 'text-t2 hover:bg-hover hover:text-t1'
              }`}
            >
              {active === item.id && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-r" />}
              <Icon size={15} className="flex-shrink-0" />
              <span className="text-left text-sm">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Content */}
      <main className="flex-1 overflow-auto p-6 max-w-2xl">
        {renderContent()}
        <p className="text-sm text-muted mt-6">Los cambios quedan registrados en auditoría.</p>
      </main>
    </div>
  );
}
