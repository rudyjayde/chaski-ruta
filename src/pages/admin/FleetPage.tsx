import { useEffect, useState } from 'react';
import {
  Plus, Search, X, ChevronRight, CheckCircle, AlertTriangle,
  Users, Wifi, WifiOff,
} from 'lucide-react';
import type { Person, Unit } from '../../types';
import { useAdminDemo } from './AdminApp';
import { useAuth } from '../../contexts/AuthContext';
import { fetchVehicles, fetchCompanies, createVehicle, fetchPeople, changeVehicleDriver, deactivateVehicle, setVehicleGpsDevice } from '../../lib/operacion-api';
import { routeLabel } from '../../lib/operacion-api';
import type { CompanyOption, CreateVehicleInput } from '../../lib/operacion-api';

const UNIT_STATUS_STYLE: Record<string, string> = {
  ACTIVO: 'bg-ok/10 text-ok',
  INACTIVO: 'bg-t2/10 text-t2',
  SUSPENDIDO: 'bg-danger/10 text-danger',
};

type DetailTab = 'resumen' | 'vehiculo' | 'conductores' | 'documentos' | 'gps' | 'historial';

function UnitDetailPanel({ unit, onClose, people, onUpdated }: { unit: Unit; onClose: () => void; people: Person[]; onUpdated: () => void }) {
  const [tab, setTab] = useState<DetailTab>('resumen');
  const { isPRO, org } = useAdminDemo();
  const { user } = useAuth();
  // Solo Super Admin puede vincular/editar el dispositivo GPS real -- lo instala
  // el equipo tecnico de CHASKI AI, nunca el admin de la asociacion (evita que
  // alguien sin saberlo desconfigure el rastreo de una unidad).
  const canEditGps = user?.role === 'superadmin';
  const [showDeactivate, setShowDeactivate] = useState(false);
  const [deactivateReason, setDeactivateReason] = useState('');
  const [deactivated, setDeactivated] = useState(false);
  const [showChangeDriver, setShowChangeDriver] = useState(false);
  const [newDriver, setNewDriver] = useState('');
  const [changeSuccess, setChangeSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [gpsDeviceInput, setGpsDeviceInput] = useState(unit.traccarDeviceId ?? '');
  const [gpsSaved, setGpsSaved] = useState('');

  const drivers = people.filter(p => p.role === 'CONDUCTOR' && p.status === 'ACTIVO');

  const TABS: { id: DetailTab; label: string }[] = [
    { id: 'resumen', label: 'Resumen' },
    { id: 'vehiculo', label: 'Vehículo' },
    { id: 'conductores', label: 'Conductores' },
    { id: 'documentos', label: 'Documentos' },
    { id: 'gps', label: 'GPS' },
    { id: 'historial', label: 'Historial' },
  ];

  const handleDeactivate = async () => {
    if (!deactivateReason) return;
    setBusy(true);
    setActionError('');
    try {
      await deactivateVehicle(unit.id, deactivateReason);
      setDeactivated(true);
      setShowDeactivate(false);
      onUpdated();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo desactivar la unidad.');
    } finally {
      setBusy(false);
    }
  };

  const handleChangeDriver = async () => {
    if (!newDriver) return;
    const driver = drivers.find(d => d.name === newDriver);
    if (!driver) return;
    setBusy(true);
    setActionError('');
    try {
      await changeVehicleDriver(unit.id, driver.id);
      setChangeSuccess(`Conductor cambiado a ${newDriver}. Asignación anterior finalizada y registrada en auditoría.`);
      setShowChangeDriver(false);
      setNewDriver('');
      onUpdated();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo cambiar el conductor.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveGpsDevice = async () => {
    setBusy(true);
    setActionError('');
    setGpsSaved('');
    try {
      await setVehicleGpsDevice(unit.id, gpsDeviceInput.trim());
      setGpsSaved(gpsDeviceInput.trim() ? 'Dispositivo vinculado.' : 'Dispositivo desvinculado.');
      onUpdated();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo guardar el dispositivo GPS.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="w-96 flex-shrink-0 border-l border-border flex flex-col bg-surface" aria-label="Detalle de unidad">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div>
          <p className="text-sm text-t2">Código</p>
          <h3 className="text-base font-bold text-t1">{unit.code}</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${deactivated ? 'bg-t2/10 text-t2' : UNIT_STATUS_STYLE[unit.status]}`}>
            {deactivated ? 'INACTIVO' : unit.status}
          </span>
          <button onClick={onClose} className="text-muted hover:text-t1 p-1" aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex border-b border-border overflow-x-auto">
        {TABS.filter(t => t.id !== 'gps' || isPRO || unit.code === '015').map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              tab === t.id ? 'border-primary text-primary' : 'border-transparent text-t2 hover:text-t1'
            }`}
          >
            {t.label}
            {t.id === 'gps' && <span className="ml-1 text-[10px] bg-ok/10 text-ok px-1 rounded">{isPRO ? 'PRO' : 'Particular'}</span>}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-3 text-sm">
        {changeSuccess && (
          <div className="flex items-start gap-2 p-3 bg-ok/5 border border-ok/30 rounded-lg text-sm text-ok">
            <CheckCircle size={13} className="mt-0.5 flex-shrink-0" />
            <span>{changeSuccess}</span>
          </div>
        )}

        {tab === 'resumen' && (
          <>
            <div className="border border-border rounded-lg divide-y divide-border text-sm">
              {[
                { label: 'Empresa', value: unit.company },
                { label: 'Socio titular', value: unit.partnerName },
                { label: 'Conductor actual', value: deactivated ? '—' : (unit.currentDriverName ?? 'Sin conductor') },
                { label: 'Ruta', value: routeLabel(unit.route, org) },
                { label: 'Placa actual', value: unit.plate, mono: true },
                { label: 'Modelo', value: unit.model },
                { label: 'Año', value: String(unit.year) },
              ].map(row => (
                <div key={row.label} className="flex justify-between px-3 py-2">
                  <span className="text-t2">{row.label}</span>
                  <span className={`text-t1 font-medium ${row.mono ? 'font-mono' : ''}`}>{row.value}</span>
                </div>
              ))}
            </div>
            {!deactivated && (
              <div className="space-y-2 pt-2">
                <button
                  onClick={() => setShowChangeDriver(true)}
                  className="w-full h-9 border border-border rounded-lg text-sm text-t1 hover:bg-hover flex items-center justify-center gap-2"
                >
                  <Users size={13} /> Cambiar conductor
                </button>
                <button
                  onClick={() => setShowDeactivate(true)}
                  className="w-full h-9 border border-danger/40 rounded-lg text-sm text-danger hover:bg-danger/5 flex items-center justify-center gap-2"
                >
                  <AlertTriangle size={13} /> Desactivar unidad
                </button>
              </div>
            )}
          </>
        )}

        {tab === 'vehiculo' && (
          <div className="border border-border rounded-lg divide-y divide-border text-sm">
            {[
              { label: 'Tipo', value: unit.vehicleType },
              { label: 'Modelo', value: unit.model },
              { label: 'Año', value: String(unit.year) },
              { label: 'Placa actual', value: unit.plate, mono: true },
              { label: 'Cap. física', value: `${unit.vehicleType === 'SPRINTER' ? 20 : unit.vehicleType === 'HIACE' ? 15 : 18} pax` },
              { label: 'Cap. vendible', value: `${unit.vehicleType === 'SPRINTER' ? 19 : unit.vehicleType === 'HIACE' ? 14 : 17} pax (excl. conductor)` },
              { label: 'Historial de placas', value: `${unit.plateHistory.length} registros` },
            ].map(row => (
              <div key={row.label} className="flex justify-between px-3 py-2">
                <span className="text-t2">{row.label}</span>
                <span className={`text-t1 font-medium ${row.mono ? 'font-mono' : ''}`}>{row.value}</span>
              </div>
            ))}
          </div>
        )}

        {tab === 'conductores' && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-t2">Conductor actual</p>
            {unit.currentDriverName ? (
              <div className="border border-border rounded-lg p-3 text-sm">
                <p className="font-medium text-t1">{unit.currentDriverName}</p>
                <p className="text-t2 mt-0.5">Asignado actualmente · ACTIVO</p>
              </div>
            ) : (
              <div className="border border-dashed border-border rounded-lg p-3 text-center text-sm text-t2">
                Sin conductor asignado
              </div>
            )}
            <p className="text-sm font-medium text-t2 pt-2">Historial de conductores</p>
            <div className="border border-border rounded-lg p-3 text-sm text-t2">
              <p>Historial disponible en Auditoría → CAMBIO_CONDUCTOR.</p>
            </div>
          </div>
        )}

        {tab === 'documentos' && (
          <div className="space-y-2">
            {[
              { label: 'SOAT', status: 'VIGENTE', expiry: '2026-12-31' },
              { label: 'Tarjeta de propiedad', status: 'VIGENTE', expiry: '—' },
              { label: 'Revisión técnica', status: 'VENCIDO', expiry: '2026-07-15' },
              { label: 'Permiso MTC', status: 'VIGENTE', expiry: '2027-03-01' },
            ].map(doc => (
              <div key={doc.label} className="border border-border rounded-lg px-3 py-2 flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium text-t1">{doc.label}</p>
                  <p className="text-t2 mt-0.5">Vence: {doc.expiry}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${doc.status === 'VIGENTE' ? 'bg-ok/10 text-ok' : 'bg-danger/10 text-danger'}`}>
                  {doc.status}
                </span>
              </div>
            ))}
          </div>
        )}

        {tab === 'gps' && (isPRO || unit.code === '015') && (
          <div className="space-y-3">
            {!isPRO && unit.code === '015' ? (
              <>
                <div className="bg-primary/5 border border-primary/25 rounded-lg p-3 text-sm">
                  <p className="font-semibold text-t1">GPS particular del socio</p>
                  <p className="text-t2 mt-1">La asociación permanece en Operación. Esta cobertura fue contratada directamente para la unidad.</p>
                </div>
                <div className="border border-border rounded-lg divide-y divide-border text-sm">
                  <div className="flex justify-between px-3 py-2"><span className="text-t2">Cobertura</span><strong className="text-primary">GPS Vehicular individual</strong></div>
                  <div className="flex justify-between px-3 py-2"><span className="text-t2">Unidad</span><strong>015 · Z5C-444</strong></div>
                  <div className="flex justify-between px-3 py-2"><span className="text-t2">Estado operativo</span><strong className="text-warn">Sin señal</strong></div>
                  <div className="flex justify-between px-3 py-2"><span className="text-t2">Titular del acceso</span><strong>{unit.partnerName}</strong></div>
                </div>
                <div className="bg-bg border border-border rounded-lg p-3 text-sm text-t2">
                  El Administrador puede reconocer que existe cobertura y usar evidencia limitada durante un viaje autorizado. No recibe el mapa privado, historial detallado, geocercas ni configuración del dispositivo.
                </div>
                <p className="text-[11px] text-muted text-center">Sin coordenadas en modo Operación. Sin acceso a Traccar ni credenciales técnicas.</p>
              </>
            ) : (
              <>
                <div className="bg-bg border border-border rounded-lg p-3 text-sm">
                  <p className="font-semibold text-t1 flex items-center gap-1.5">
                    {unit.traccarDeviceId ? <Wifi size={13} className="text-ok" /> : <WifiOff size={13} className="text-muted" />}
                    {unit.traccarDeviceId ? 'Dispositivo vinculado' : 'Sin dispositivo GPS vinculado'}
                  </p>
                  <p className="text-t2 mt-1">
                    {canEditGps
                      ? 'Vincula el dispositivo Teltonika real (Traccar) de esta unidad para que aparezca en "GPS en vivo". Nunca se muestra una posición sin señal real.'
                      : 'La ubicación de esta unidad aparece en "GPS en vivo" una vez que el equipo técnico de CHASKI AI instala y vincula el dispositivo.'}
                  </p>
                </div>
                {canEditGps ? (
                  <div>
                    <label className="text-xs font-medium text-t2 block mb-1">ID del dispositivo en Traccar (uniqueId / IMEI)</label>
                    <div className="flex gap-2">
                      <input
                        value={gpsDeviceInput}
                        onChange={(e) => { setGpsDeviceInput(e.target.value); setGpsSaved(''); }}
                        placeholder="ej. 354301021234567"
                        className="flex-1 h-9 px-3 border border-border rounded-lg text-sm font-mono bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <button
                        onClick={handleSaveGpsDevice}
                        disabled={busy || gpsDeviceInput.trim() === (unit.traccarDeviceId ?? '')}
                        className="h-9 px-3 rounded-lg text-sm font-medium bg-primary text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90"
                      >
                        Guardar
                      </button>
                    </div>
                    {gpsSaved && <p className="text-xs text-ok mt-1.5">{gpsSaved}</p>}
                    <p className="text-[11px] text-muted text-center mt-1.5">Deja el campo vacío y guarda para desvincular. El ID exacto lo encuentras en el panel de Traccar, sección Dispositivos.</p>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted text-center">¿Necesitas instalar o cambiar el dispositivo de esta unidad? Contacta al equipo de CHASKI AI.</p>
                )}
              </>
            )}
          </div>
        )}

        {tab === 'historial' && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-t2">Historial de placas</p>
            {unit.plateHistory.map((h, i) => (
              <div key={i} className="border border-border rounded-lg px-3 py-2 flex items-center justify-between text-sm">
                <span className="font-mono text-t1">{h.plate}</span>
                <span className="text-t2">{h.from}{h.to ? ` → ${h.to}` : ' → actual'}</span>
              </div>
            ))}
            <p className="text-sm text-muted pt-2">Historial de eventos: Auditoría → Unidades.</p>
          </div>
        )}
      </div>

      {showDeactivate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
          <div className="bg-surface rounded-lg shadow-xl w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-t1 mb-1">Desactivar unidad {unit.code}</h3>
            <p className="text-sm text-t2 mb-4">El código permanece en el historial. Se requiere motivo.</p>
            <select value={deactivateReason} onChange={e => setDeactivateReason(e.target.value)} className="w-full h-9 px-3 border border-border rounded-lg text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="">Seleccionar motivo…</option>
              {['Vehículo dado de baja', 'Falla mecánica grave', 'Documentos vencidos', 'Sanción administrativa', 'Solicitud del socio', 'Otro'].map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            {actionError && <p className="text-sm text-danger mb-3">{actionError}</p>}
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowDeactivate(false)} disabled={busy} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-hover disabled:opacity-50">Cancelar</button>
              <button onClick={handleDeactivate} disabled={!deactivateReason || busy} className="px-4 py-2 text-sm bg-danger text-white rounded-lg hover:bg-danger/80 disabled:opacity-50">
                {busy ? 'Desactivando…' : 'Desactivar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showChangeDriver && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
          <div className="bg-surface rounded-lg shadow-xl w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-t1 mb-1">Cambiar conductor — Unidad {unit.code}</h3>
            <p className="text-sm text-t2 mb-4">La asignación anterior queda finalizada con auditoría.</p>
            <select value={newDriver} onChange={e => setNewDriver(e.target.value)} className="w-full h-9 px-3 border border-border rounded-lg text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="">Seleccionar conductor…</option>
              {drivers.map(d => <option key={d.id} value={d.name}>{d.name} — {d.company}</option>)}
            </select>
            {actionError && <p className="text-sm text-danger mb-3">{actionError}</p>}
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowChangeDriver(false)} disabled={busy} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-hover disabled:opacity-50">Cancelar</button>
              <button onClick={handleChangeDriver} disabled={!newDriver || busy} className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-h disabled:opacity-50">
                {busy ? 'Guardando…' : 'Confirmar cambio'}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

const STEP_LABELS = [
  'Código y empresa',
  'Vehículo',
  'Documentos',
  'Vinculación posterior',
  'GPS PRO',
  'Confirmación',
];

function RegisterWizard({ onClose, companies, onCreated }: { onClose: () => void; companies: CompanyOption[]; onCreated: () => void }) {
  const { isPRO } = useAdminDemo();
  const [step, setStep] = useState<WizardStep>(1);
  const [form, setForm] = useState({
    code: '', company: '', vehicleType: '' as '' | 'SPRINTER' | 'HIACE' | 'MASTER', partnerName: '', registrationDate: '',
    plate: '', brand: '', model: '', year: '', color: '', capacity: '', vendible: '',
    soat: '', tarjetaPropiedad: '', revisionTecnica: '', permisos: '',
    driverOption: 'existing' as 'existing' | 'invite' | 'none',
    driverName: '',
    gpsOption: 'later' as 'register' | 'link' | 'later',
    gpsModel: '', gpsImei: '', gpsSim: '', gpsOperator: '',
  });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const set = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const stepLabels = isPRO ? STEP_LABELS : STEP_LABELS.filter((_, i) => i !== 4);

  const handleNext = () => {
    if (!isPRO && step === 4) { setStep(6); return; }
    if (step < 6) setStep((step + 1) as WizardStep);
  };
  const saveRegistration = async () => {
    const normalizedPlate = form.plate.trim().toUpperCase();
    if (!form.code || !form.company || !normalizedPlate || !form.vehicleType) return;
    setSaving(true);
    setSaveError('');
    try {
      const input: CreateVehicleInput = {
        code: form.code,
        companyId: form.company,
        vehicleType: form.vehicleType,
        plate: normalizedPlate,
        model: [form.brand, form.model].filter(Boolean).join(' ') || form.model,
        year: Number(form.year) || new Date().getFullYear(),
      };
      await createVehicle(input);
      onCreated();
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'No se pudo registrar la unidad.');
    } finally {
      setSaving(false);
    }
  };
  const handlePrev = () => {
    if (!isPRO && step === 6) { setStep(4); return; }
    if (step > 1) setStep((step - 1) as WizardStep);
  };

  const displayStep = (!isPRO && step >= 5) ? step - 1 : step;

  if (saved) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
        <div className="bg-surface rounded-lg shadow-xl w-full max-w-md p-8 text-center">
          <CheckCircle size={40} className="text-ok mx-auto mb-4" />
          <h3 className="text-base font-semibold text-t1 mb-2">Unidad registrada</h3>
          <p className="text-sm text-t2 mb-2">Código <strong>{form.code || 'NUEVO'}</strong> registrado con éxito en ATIPCAR.</p>
          <p className="text-sm text-muted mb-6">Registro en auditoría. La unidad queda disponible para vincularla después con un socio y un conductor.</p>
          <button onClick={onClose} className="px-6 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h">
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
      <div className="bg-surface rounded-lg shadow-xl w-full max-w-xl flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-t1">Registrar unidad</h3>
            <p className="text-sm text-t2 mt-0.5">Paso {displayStep} de {stepLabels.length}: {stepLabels[displayStep - 1]}</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-t1 p-1" aria-label="Cerrar"><X size={18} /></button>
        </div>

        <div className="px-6 pt-4 flex gap-1.5">
          {stepLabels.map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full ${i < displayStep ? 'bg-primary' : 'bg-border'}`} />
          ))}
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-4">
          {step === 1 && (
            <>
              {[
                { key: 'code', label: 'Código de unidad', placeholder: 'Ej. 061', hint: 'El código pertenece a la unidad dentro de la asociación y no cambia con la placa.', required: true },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-t1 mb-1">{f.label} {f.required && <span className="text-danger">*</span>}</label>
                  <input value={(form as Record<string, string>)[f.key]} onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder} className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  {f.hint && <p className="text-xs text-muted mt-1">{f.hint}</p>}
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-t1 mb-1">Empresa integrante <span className="text-danger">*</span></label>
                <select value={form.company} onChange={e => set('company', e.target.value)} className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                  <option value="">Seleccionar empresa…</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-t1 mb-1">Fecha de inscripción</label>
                <input type="date" value={form.registrationDate} onChange={e => set('registrationDate', e.target.value)} className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <label className="block text-sm font-medium text-t1 mb-1">Tipo de vehículo <span className="text-danger">*</span></label>
                <select value={form.vehicleType} onChange={e => set('vehicleType', e.target.value)} className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                  <option value="">Seleccionar tipo…</option>
                  {['SPRINTER', 'HIACE', 'MASTER'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { key: 'plate', label: 'Placa', placeholder: 'Z0A-001', required: true, mono: true },
                  { key: 'brand', label: 'Marca', placeholder: 'Mercedes Benz' },
                  { key: 'model', label: 'Modelo', placeholder: 'Sprinter 519' },
                  { key: 'year', label: 'Año', placeholder: '2024' },
                  { key: 'color', label: 'Color', placeholder: 'Blanco' },
                  { key: 'capacity', label: 'Cap. física (pax)', placeholder: '20' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="block text-sm font-medium text-t1 mb-1">{f.label} {f.required && <span className="text-danger">*</span>}</label>
                    <input
                      value={(form as Record<string, string>)[f.key]}
                      onChange={e => set(f.key, f.mono ? e.target.value.toUpperCase() : e.target.value)}
                      placeholder={f.placeholder}
                      className={`w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary ${f.mono ? 'font-mono' : ''}`}
                    />
                  </div>
                ))}
              </div>
              <div>
                <label className="block text-sm font-medium text-t1 mb-1">Pax vendibles (excl. conductor)</label>
                <input value={form.vendible} onChange={e => set('vendible', e.target.value)} placeholder="19" className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                <p className="text-xs text-muted mt-1">El asiento del conductor no se vende. Cap. vendible = física − 1.</p>
              </div>
            </>
          )}

          {step === 3 && (
            <div className="space-y-4">
              {[
                { key: 'soat', label: 'SOAT — vencimiento' },
                { key: 'tarjetaPropiedad', label: 'Tarjeta de propiedad' },
                { key: 'revisionTecnica', label: 'Revisión técnica — vencimiento' },
                { key: 'permisos', label: 'Permiso MTC — vencimiento' },
              ].map(doc => (
                <div key={doc.key}>
                  <label className="block text-sm font-medium text-t1 mb-1">{doc.label}</label>
                  <input type="date" value={(form as Record<string, string>)[doc.key]} onChange={e => set(doc.key, e.target.value)} className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              ))}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                <h4 className="text-base font-semibold text-t1">La unidad se registra primero</h4>
                <p className="text-sm text-t2 mt-2">Al finalizar quedará sin propietario y sin conductor. Después:</p>
                <ol className="mt-3 space-y-2 text-sm text-t2 list-decimal pl-5">
                  <li>Registra al socio desde Personas → Socios y selecciona esta unidad como propiedad.</li>
                  <li>Registra al conductor desde Personas → Conductores y selecciona la unidad que manejará.</li>
                  <li>Si el socio conduce su propio vehículo, agrega también su rol de conductor sin crear otra cuenta.</li>
                </ol>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="p-3 border border-border rounded-lg"><span className="text-t2">Propietario inicial</span><strong className="block text-t1 mt-1">Sin socio asignado</strong></div>
                <div className="p-3 border border-border rounded-lg"><span className="text-t2">Conductor inicial</span><strong className="block text-t1 mt-1">Sin conductor asignado</strong></div>
              </div>
            </div>
          )}

          {step === 5 && isPRO && (
            <div className="space-y-4">
              <div className="space-y-2">
                {[
                  { id: 'register', label: 'Registrar nuevo dispositivo GPS (Teltonika)' },
                  { id: 'link', label: 'Vincular dispositivo existente' },
                  { id: 'later', label: 'Configurar GPS después' },
                ].map(opt => (
                  <label key={opt.id} className="flex items-center gap-3 p-3 border border-border rounded-lg cursor-pointer hover:bg-hover">
                    <input type="radio" name="gpsOption" value={opt.id} checked={form.gpsOption === opt.id} onChange={e => set('gpsOption', e.target.value)} className="text-primary" />
                    <span className="text-sm text-t1">{opt.label}</span>
                  </label>
                ))}
              </div>
              {form.gpsOption === 'register' && (
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: 'gpsModel', label: 'Modelo Teltonika', type: 'select', options: ['FMB920', 'FMB140', 'FMB150', 'FMT100'] },
                    { key: 'gpsImei', label: 'IMEI (15 dígitos)', placeholder: '354301…', mono: true },
                    { key: 'gpsSim', label: 'N.º SIM', placeholder: '51 9XXXXXXX', mono: true },
                    { key: 'gpsOperator', label: 'Operador', type: 'select', options: ['Claro Perú', 'Entel', 'Bitel', 'Movistar'] },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="block text-sm font-medium text-t1 mb-1">{f.label}</label>
                      {f.type === 'select' ? (
                        <select value={(form as Record<string, string>)[f.key]} onChange={e => set(f.key, e.target.value)} className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                          <option value="">Seleccionar…</option>
                          {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input value={(form as Record<string, string>)[f.key]} onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder} className={`w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary ${f.mono ? 'font-mono' : ''}`} />
                      )}
                    </div>
                  ))}
                </div>
              )}
              {form.gpsOption === 'later' && (
                <p className="text-sm text-t2 p-3 border border-dashed border-border rounded-lg">El dispositivo GPS se registrará después en Dispositivos GPS. La unidad mostrará "Sin dispositivo".</p>
              )}
              <p className="text-xs text-muted">El GPS se vincula al vehículo, nunca al conductor. La posición solo se mostrará al recibir telemetría válida.</p>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-4">
              <p className="text-sm text-t2">Revisa los datos antes de confirmar.</p>
              <div className="border border-border rounded-lg divide-y divide-border text-sm">
                {[
                  { label: 'Código', value: form.code || '—' },
                  { label: 'Empresa', value: companies.find(c => c.id === form.company)?.name || '—' },
                  { label: 'Tipo de vehículo', value: form.vehicleType || '—' },
                  { label: 'Socio propietario', value: 'Sin socio asignado' },
                  { label: 'Placa', value: form.plate || '—', mono: true },
                  { label: 'Modelo', value: [form.brand, form.model, form.year].filter(Boolean).join(' ') || '—' },
                  { label: 'Cap. física', value: form.capacity ? `${form.capacity} pax` : '—' },
                  { label: 'Cap. vendible', value: form.vendible ? `${form.vendible} pax` : '—' },
                  { label: 'Conductor', value: 'Sin conductor asignado' },
                  ...(isPRO ? [{ label: 'GPS', value: form.gpsOption === 'register' ? `Teltonika ${form.gpsModel || '—'}` : form.gpsOption === 'link' ? 'Vinculado' : 'Configurar después' }] : []),
                ].map(row => (
                  <div key={row.label} className="flex justify-between px-3 py-2">
                    <span className="text-t2">{row.label}</span>
                    <span className={`text-t1 font-medium ${(row as Record<string, unknown>).mono ? 'font-mono' : ''}`}>{row.value}</span>
                  </div>
                ))}
              </div>
              <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg text-sm text-t2">
                Al confirmar, el registro queda en auditoría con tu identidad y marca de tiempo.
              </div>
            </div>
          )}
        </div>

        {saveError && (
          <div className="px-6 py-2 text-sm text-danger bg-danger/5 border-t border-danger/20">{saveError}</div>
        )}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <button onClick={step === 1 ? onClose : handlePrev} disabled={saving} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-hover disabled:opacity-50">
            {step === 1 ? 'Cancelar' : 'Anterior'}
          </button>
          {step < 6 ? (
            <button onClick={handleNext} className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-h flex items-center gap-2">
              Siguiente <ChevronRight size={14} />
            </button>
          ) : (
            <button onClick={saveRegistration} disabled={saving} className="px-4 py-2 text-sm bg-ok text-white rounded-lg hover:bg-ok/80 disabled:opacity-50 flex items-center gap-2">
              <CheckCircle size={14} /> {saving ? 'Guardando…' : 'Confirmar registro'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function FleetPage() {
  const [search, setSearch] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [selected, setSelected] = useState<Unit | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [units, setUnits] = useState<Unit[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const { isPRO, org } = useAdminDemo();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    Promise.all([fetchVehicles(), fetchCompanies(), fetchPeople()])
      .then(([v, c, p]) => {
        if (cancelled) return;
        setUnits(v);
        setCompanies(c);
        setPeople(p);
      })
      .catch(err => { if (!cancelled) setLoadError(err instanceof Error ? err.message : 'No se pudo cargar la flota.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  const allUnits = units;

  const filtered = allUnits.filter(u => {
    const q = search.toLowerCase();
    const matchSearch = !q || u.code.includes(q) || u.plate.toLowerCase().includes(q) ||
      (u.currentDriverName?.toLowerCase().includes(q) ?? false) || u.partnerName.toLowerCase().includes(q);
    const matchCompany = !filterCompany || u.company === filterCompany;
    const matchStatus = !filterStatus || u.status === filterStatus;
    return matchSearch && matchCompany && matchStatus;
  });

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-border bg-surface flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-t1">Unidades y flota</h1>
          <p className="text-sm text-t2 mt-0.5">ATIPCAR · {allUnits.length} unidades registradas · Mostrando {filtered.length}</p>
        </div>
        <button
          onClick={() => setShowWizard(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h transition-colors"
        >
          <Plus size={15} /> Registrar unidad
        </button>
      </div>

      <div className="px-6 py-3 border-b border-border bg-surface flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            placeholder="Código, placa, conductor…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-9 pl-9 pr-3 border border-border rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary w-64"
          />
        </div>
        <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)} className="h-9 px-3 border border-border rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary">
          <option value="">Todas las empresas</option>
          {companies.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="h-9 px-3 border border-border rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary">
          <option value="">Todos los estados</option>
          {['ACTIVO', 'INACTIVO', 'SUSPENDIDO'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="text-sm text-t2 ml-auto">{filtered.length} unidades</span>
      </div>

      {loadError && (
        <div className="px-6 py-3 bg-danger/5 border-b border-danger/20 text-sm text-danger">{loadError}</div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className={`flex-1 overflow-auto ${selected ? 'border-r border-border' : ''}`}>
          {loading ? (
            <div className="p-10 text-center text-sm text-t2">Cargando unidades…</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-t2">No hay unidades que coincidan con los filtros.</div>
          ) : (
          <table className="w-full text-sm" aria-label="Tabla de unidades">
            <thead className="sticky top-0">
              <tr className="border-b border-border bg-bg">
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Cód.</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Empresa</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Socio</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Vehículo</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Placa</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Conductor</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Ruta</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">GPS</th>
                <th className="text-left px-4 py-2.5 text-t2 font-medium">Estado</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(unit => (
                <tr
                  key={unit.id}
                  className={`border-b border-border last:border-0 hover:bg-hover cursor-pointer ${selected?.id === unit.id ? 'bg-hover' : ''}`}
                  onClick={() => setSelected(selected?.id === unit.id ? null : unit)}
                >
                  <td className="px-4 py-3 font-bold text-t1">{unit.code}</td>
                  <td className="px-4 py-3 text-t2">{unit.company}</td>
                  <td className="px-4 py-3 text-t1 max-w-[120px] truncate">{unit.partnerName || <span className="text-muted italic">Sin socio</span>}</td>
                  <td className="px-4 py-3 text-t2">{unit.vehicleType}</td>
                  <td className="px-4 py-3 font-mono text-t1">{unit.plate}</td>
                  <td className="px-4 py-3 text-t1 max-w-[120px] truncate">
                    {unit.currentDriverName || <span className="text-muted italic">Sin conductor</span>}
                  </td>
                  <td className="px-4 py-3 text-t2">{routeLabel(unit.route, org)}</td>
                  <td className="px-4 py-3">
                    {isPRO ? (
                      <span className={'text-[11px] px-1.5 py-0.5 rounded flex items-center gap-1 w-fit ' + (parseInt(unit.code) <= 7 ? 'bg-ok/10 text-ok' : 'bg-border text-muted')}>
                        {parseInt(unit.code) <= 7 ? <><Wifi size={9} /> PRO</> : <><WifiOff size={9} /> Sin GPS</>}
                      </span>
                    ) : unit.code === '015' ? (
                      <span className="text-[11px] px-1.5 py-0.5 rounded flex items-center gap-1 w-fit bg-primary/10 text-primary">
                        <Wifi size={9} /> Particular
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${UNIT_STATUS_STYLE[unit.status]}`}>
                      {unit.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <ChevronRight size={14} className="text-muted" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>

        {selected && <UnitDetailPanel unit={selected} onClose={() => setSelected(null)} people={people} onUpdated={() => setRefreshKey(k => k + 1)} />}
      </div>

      {showWizard && (
        <RegisterWizard
          onClose={() => setShowWizard(false)}
          companies={companies}
          onCreated={() => setRefreshKey(k => k + 1)}
        />
      )}
    </div>
  );
}
