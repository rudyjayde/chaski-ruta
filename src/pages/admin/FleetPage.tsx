import { useEffect, useState } from 'react';
import {
  Plus, Search, X, ChevronRight, CheckCircle, AlertTriangle,
  Users, Wifi, WifiOff,
} from 'lucide-react';
import {
  fetchVehicles, fetchCompanies, fetchPeople, fetchGpsDevices,
  createVehicle, changeVehicleDriver, deactivateVehicle, retireVehicle, retireVehicles, restoreVehicle,
  type CompanyOption, type VehicleGpsStatus,
} from '../../lib/operacion-api';
import type { Person, Unit } from '../../types';
import { useAdminDemo } from './AdminApp';
import { PLATE_ERROR, YEAR_ERROR, isValidPlate, isValidYear, sanitizePlate, sanitizeYear, yearMax, YEAR_MIN } from '../../lib/validators';
import { VEHICLE_BRANDS, findVehicleBrand } from '../../lib/vehicle-catalog';

const UNIT_STATUS_STYLE: Record<string, string> = {
  ACTIVO: 'bg-ok/10 text-ok',
  INACTIVO: 'bg-t2/10 text-t2',
  SUSPENDIDO: 'bg-danger/10 text-danger',
  BAJA: 'bg-border text-muted',
};

const UNIT_STATUS_LABEL: Record<string, string> = { BAJA: 'DE BAJA' };

const RETIRE_REASONS = ['Vendida o fuera de servicio', 'Registrada por error o de prueba', 'Siniestro o pérdida total', 'Retiro de la empresa', 'Otro'];

type DetailTab = 'resumen' | 'vehiculo' | 'conductores' | 'gps' | 'historial';

function maskDeviceId(id: string): string {
  return id.length <= 4 ? id : `${id.slice(0, 4)}${'X'.repeat(id.length - 4)}`;
}

function UnitDetailPanel({ unit, people, gpsStatus, onClose, onChanged }: {
  unit: Unit;
  people: Person[];
  gpsStatus: VehicleGpsStatus | undefined;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<DetailTab>('resumen');
  const { isPRO } = useAdminDemo();
  const [showDeactivate, setShowDeactivate] = useState(false);
  const [deactivateReason, setDeactivateReason] = useState('');
  const [deactivating, setDeactivating] = useState(false);
  const [deactivateError, setDeactivateError] = useState('');
  const [showRetire, setShowRetire] = useState(false);
  const [retireReason, setRetireReason] = useState('');
  const [retiring, setRetiring] = useState(false);
  const [retireError, setRetireError] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [showChangeDriver, setShowChangeDriver] = useState(false);
  const [newDriverId, setNewDriverId] = useState('');
  const [changingDriver, setChangingDriver] = useState(false);
  const [changeError, setChangeError] = useState('');
  const [changeSuccess, setChangeSuccess] = useState('');

  const drivers = people.filter(p => p.role === 'CONDUCTOR' && p.status === 'ACTIVO');

  // GPS Vehicular individual (docs/planes/plan-gps-vehicular.md): una unidad
  // puede tener dispositivo vinculado aunque la asociacion siga en Operacion --
  // titular del contrato es el socio, no la asociacion.
  const hasIndividualGps = !isPRO && Boolean(unit.traccarDeviceId);

  const TABS: { id: DetailTab; label: string }[] = [
    { id: 'resumen', label: 'Resumen' },
    { id: 'vehiculo', label: 'Vehículo' },
    { id: 'conductores', label: 'Conductores' },
    { id: 'gps', label: 'GPS' },
    { id: 'historial', label: 'Historial' },
  ];

  const handleDeactivate = async () => {
    if (!deactivateReason) return;
    setDeactivating(true);
    setDeactivateError('');
    try {
      await deactivateVehicle(unit.id, deactivateReason);
      setShowDeactivate(false);
      onChanged();
      onClose();
    } catch (err) {
      setDeactivateError(err instanceof Error ? err.message : 'No se pudo desactivar la unidad.');
    } finally {
      setDeactivating(false);
    }
  };

  const handleRetire = async () => {
    if (!retireReason) return;
    setRetiring(true);
    setRetireError('');
    try {
      await retireVehicle(unit.id, retireReason);
      setShowRetire(false);
      onChanged();
      onClose();
    } catch (err) {
      setRetireError(err instanceof Error ? err.message : 'No se pudo dar de baja la unidad.');
    } finally {
      setRetiring(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    setRetireError('');
    try {
      await restoreVehicle(unit.id);
      onChanged();
      onClose();
    } catch (err) {
      setRetireError(err instanceof Error ? err.message : 'No se pudo restaurar la unidad.');
    } finally {
      setRestoring(false);
    }
  };

  const handleChangeDriver = async () => {
    if (!newDriverId) return;
    setChangingDriver(true);
    setChangeError('');
    try {
      await changeVehicleDriver(unit.id, newDriverId);
      const driverName = drivers.find(d => d.id === newDriverId)?.name ?? '';
      setChangeSuccess(`Conductor cambiado a ${driverName}. Asignación anterior finalizada y registrada en auditoría.`);
      setShowChangeDriver(false);
      setNewDriverId('');
      onChanged();
    } catch (err) {
      setChangeError(err instanceof Error ? err.message : 'No se pudo cambiar el conductor.');
    } finally {
      setChangingDriver(false);
    }
  };

  return (
    <aside className="fixed inset-0 z-40 w-full md:static md:inset-auto md:z-auto md:w-96 md:flex-shrink-0 border-l border-border flex flex-col bg-surface" aria-label="Detalle de unidad">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div>
          <p className="text-xs text-t2">Código</p>
          <h3 className="text-base font-bold text-t1">{unit.code}</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${UNIT_STATUS_STYLE[unit.status]}`}>
            {UNIT_STATUS_LABEL[unit.status] ?? unit.status}
          </span>
          <button onClick={onClose} className="text-muted hover:text-t1 p-1" aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex border-b border-border overflow-x-auto">
        {TABS.filter(t => t.id !== 'gps' || isPRO || hasIndividualGps).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
              tab === t.id ? 'border-primary text-primary' : 'border-transparent text-t2 hover:text-t1'
            }`}
          >
            {t.label}
            {t.id === 'gps' && <span className="ml-1 text-[9px] bg-ok/10 text-ok px-1 rounded">{isPRO ? 'PRO' : 'Particular'}</span>}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-3 text-sm">
        {changeSuccess && (
          <div className="flex items-start gap-2 p-3 bg-ok/5 border border-ok/30 rounded-lg text-xs text-ok">
            <CheckCircle size={13} className="mt-0.5 flex-shrink-0" />
            <span>{changeSuccess}</span>
          </div>
        )}

        {tab === 'resumen' && (
          <>
            <div className="border border-border rounded-lg divide-y divide-border text-xs">
              {[
                { label: 'Empresa', value: unit.company },
                { label: 'Socio titular', value: unit.partnerName || '—' },
                { label: 'Conductor actual', value: unit.status === 'INACTIVO' || unit.status === 'BAJA' ? '—' : (unit.currentDriverName || 'Sin conductor') },
                { label: 'Ruta', value: unit.route },
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
            {unit.status === 'BAJA' ? (
              <div className="space-y-2 pt-2">
                <p className="text-[11px] text-t2">Esta unidad está dada de baja: no aparece en la flota ni opera. Su historial se conserva.</p>
                {retireError && <p className="text-xs text-danger">{retireError}</p>}
                <button
                  onClick={handleRestore}
                  disabled={restoring}
                  className="w-full h-9 border border-ok/40 rounded-lg text-xs text-ok hover:bg-ok/5 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <CheckCircle size={13} /> {restoring ? 'Restaurando…' : 'Restaurar unidad'}
                </button>
              </div>
            ) : (
              <div className="space-y-2 pt-2">
                {unit.status !== 'INACTIVO' && (
                  <>
                    <button
                      onClick={() => setShowChangeDriver(true)}
                      className="w-full h-9 border border-border rounded-lg text-xs text-t1 hover:bg-hover flex items-center justify-center gap-2"
                    >
                      <Users size={13} /> Cambiar conductor
                    </button>
                    <button
                      onClick={() => setShowDeactivate(true)}
                      className="w-full h-9 border border-danger/40 rounded-lg text-xs text-danger hover:bg-danger/5 flex items-center justify-center gap-2"
                    >
                      <AlertTriangle size={13} /> Desactivar unidad
                    </button>
                  </>
                )}
                <button
                  onClick={() => setShowRetire(true)}
                  className="w-full h-9 border border-border rounded-lg text-xs text-t2 hover:bg-hover flex items-center justify-center gap-2"
                >
                  <X size={13} /> Dar de baja
                </button>
              </div>
            )}
          </>
        )}

        {tab === 'vehiculo' && (
          <div className="border border-border rounded-lg divide-y divide-border text-xs">
            {[
              { label: 'Tipo', value: unit.vehicleType },
              { label: 'Modelo', value: unit.model },
              { label: 'Año', value: String(unit.year) },
              { label: 'Placa actual', value: unit.plate, mono: true },
              { label: 'Cap. física', value: `${unit.vehicleType === 'SPRINTER' ? 20 : 15} pax` },
              { label: 'Cap. vendible', value: `${unit.vehicleType === 'SPRINTER' ? 19 : 14} pax (excl. conductor)` },
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
            <p className="text-xs font-medium text-t2">Conductor actual</p>
            {unit.currentDriverName ? (
              <div className="border border-border rounded-lg p-3 text-xs">
                <p className="font-medium text-t1">{unit.currentDriverName}</p>
                <p className="text-t2 mt-0.5">Asignado actualmente · ACTIVO</p>
              </div>
            ) : (
              <div className="border border-dashed border-border rounded-lg p-3 text-center text-xs text-t2">
                Sin conductor asignado
              </div>
            )}
            <p className="text-xs font-medium text-t2 pt-2">Historial de conductores</p>
            <div className="border border-border rounded-lg p-3 text-xs text-t2">
              <p>Historial disponible en Auditoría → CAMBIO_CONDUCTOR.</p>
            </div>
          </div>
        )}

        {tab === 'gps' && (isPRO || hasIndividualGps) && (
          <div className="space-y-3">
            {hasIndividualGps && !isPRO ? (
              <>
                <div className="bg-primary/5 border border-primary/25 rounded-lg p-3 text-xs">
                  <p className="font-semibold text-t1">GPS particular del socio</p>
                  <p className="text-t2 mt-1">La asociación permanece en Operación. Esta cobertura fue contratada directamente para la unidad.</p>
                </div>
                <div className="border border-border rounded-lg divide-y divide-border text-xs">
                  <div className="flex justify-between px-3 py-2"><span className="text-t2">Cobertura</span><strong className="text-primary">GPS Vehicular individual</strong></div>
                  <div className="flex justify-between px-3 py-2"><span className="text-t2">Unidad</span><strong>{unit.code} · {unit.plate}</strong></div>
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-t2">Estado operativo</span>
                    <strong className={gpsStatus?.online === 'online' ? 'text-ok' : 'text-warn'}>
                      {gpsStatus?.online === 'online' ? 'En línea' : 'Sin señal'}
                    </strong>
                  </div>
                  <div className="flex justify-between px-3 py-2"><span className="text-t2">Titular del acceso</span><strong>{unit.partnerName || '—'}</strong></div>
                </div>
                <div className="bg-bg border border-border rounded-lg p-3 text-xs text-t2">
                  El Administrador puede reconocer que existe cobertura y usar evidencia limitada durante un viaje autorizado. No recibe el mapa privado, historial detallado, geocercas ni configuración del dispositivo.
                </div>
                <p className="text-[10px] text-muted text-center">Sin coordenadas en modo Operación. Sin acceso a Traccar ni credenciales técnicas.</p>
              </>
            ) : (
              <>
                <div className="border border-border rounded-lg divide-y divide-border text-xs">
                  {[
                    { label: 'Dispositivo vinculado', value: unit.traccarDeviceId ? maskDeviceId(unit.traccarDeviceId) : 'Sin dispositivo', mono: Boolean(unit.traccarDeviceId) },
                    { label: 'Estado', value: !unit.traccarDeviceId ? 'Sin dispositivo' : gpsStatus?.online === 'online' ? 'En línea' : gpsStatus?.online === 'offline' ? 'Sin señal' : 'Desconocido' },
                    { label: 'Última señal', value: gpsStatus?.lastUpdate ? new Date(gpsStatus.lastUpdate).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—' },
                  ].map(row => (
                    <div key={row.label} className="flex justify-between px-3 py-2">
                      <span className="text-t2">{row.label}</span>
                      <span className={'text-t1 font-medium ' + (row.mono ? 'font-mono' : '')}>{row.value}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted text-center">Identificador del dispositivo enmascarado. El registro/vinculación del hardware lo hace Super Admin tras la instalación física.</p>
              </>
            )}
          </div>
        )}

        {tab === 'historial' && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-t2">Historial de placas</p>
            {unit.plateHistory.map((h, i) => (
              <div key={i} className="border border-border rounded-lg px-3 py-2 flex items-center justify-between text-xs">
                <span className="font-mono text-t1">{h.plate}</span>
                <span className="text-t2">{h.from}{h.to ? ` → ${h.to}` : ' → actual'}</span>
              </div>
            ))}
            <p className="text-xs text-muted pt-2">Historial de eventos: Auditoría → Unidades.</p>
          </div>
        )}
      </div>

      {showDeactivate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
          <div className="bg-surface rounded-lg shadow-xl w-full max-w-sm p-6">
            <h3 className="text-sm font-semibold text-t1 mb-1">Desactivar unidad {unit.code}</h3>
            <p className="text-xs text-t2 mb-4">El código permanece en el historial. Se requiere motivo.</p>
            <select value={deactivateReason} onChange={e => setDeactivateReason(e.target.value)} className="w-full h-9 px-3 border border-border rounded-lg text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="">Seleccionar motivo…</option>
              {['Falla mecánica grave', 'Documentos vencidos', 'Sanción administrativa', 'Solicitud del socio', 'Otro'].map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            {deactivateError && <p className="text-xs text-danger mb-3">{deactivateError}</p>}
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowDeactivate(false)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-hover">Cancelar</button>
              <button onClick={handleDeactivate} disabled={!deactivateReason || deactivating} className="px-4 py-2 text-sm bg-danger text-white rounded-lg hover:bg-danger/80 disabled:opacity-50">
                {deactivating ? 'Desactivando…' : 'Desactivar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRetire && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-label="Dar de baja unidad">
          <div className="bg-surface rounded-lg shadow-xl w-full max-w-sm p-6">
            <h3 className="text-sm font-semibold text-t1 mb-1">Dar de baja la unidad {unit.code}</h3>
            <p className="text-xs text-t2 mb-4">
              Deja de operar y desaparece de la flota. El historial de viajes se conserva y puedes restaurarla después. Se requiere motivo.
            </p>
            <select value={retireReason} onChange={e => setRetireReason(e.target.value)} className="w-full h-9 px-3 border border-border rounded-lg text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="">Seleccionar motivo…</option>
              {RETIRE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            {retireError && <p className="text-xs text-danger mb-3">{retireError}</p>}
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setShowRetire(false); setRetireError(''); }} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-hover">Cancelar</button>
              <button onClick={handleRetire} disabled={!retireReason || retiring} className="px-4 py-2 text-sm bg-danger text-white rounded-lg hover:bg-danger/80 disabled:opacity-50">
                {retiring ? 'Dando de baja…' : 'Dar de baja'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showChangeDriver && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
          <div className="bg-surface rounded-lg shadow-xl w-full max-w-sm p-6">
            <h3 className="text-sm font-semibold text-t1 mb-1">Cambiar conductor — Unidad {unit.code}</h3>
            <p className="text-xs text-t2 mb-4">La asignación anterior queda finalizada con auditoría.</p>
            <select value={newDriverId} onChange={e => setNewDriverId(e.target.value)} className="w-full h-9 px-3 border border-border rounded-lg text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="">Seleccionar conductor…</option>
              {drivers.map(d => <option key={d.id} value={d.id}>{d.name} — {d.company}</option>)}
            </select>
            {changeError && <p className="text-xs text-danger mb-3">{changeError}</p>}
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowChangeDriver(false)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-hover">Cancelar</button>
              <button onClick={handleChangeDriver} disabled={!newDriverId || changingDriver} className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-h disabled:opacity-50">
                {changingDriver ? 'Guardando…' : 'Confirmar cambio'}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

type WizardStep = 1 | 2 | 3;

const STEP_LABELS = ['Empresa', 'Vehículo', 'Confirmación'];

function RegisterWizard({ companies, units, onClose, onCreated }: { companies: CompanyOption[]; units: Unit[]; onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState<WizardStep>(1);
  const [form, setForm] = useState({
    companyId: '',
    plate: '', brand: '', year: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [assignedCode, setAssignedCode] = useState('');

  const set = (k: string, v: string) => { setForm(prev => ({ ...prev, [k]: v })); setError(''); };

  // El modelo no se escribe: sale de la marca elegida (una marca = un modelo).
  const brandInfo = findVehicleBrand(form.brand);

  // Aviso en vivo -- la placa repetida se ve apenas se escribe, no al final.
  // El código lo asigna el backend (MEJ-002): ya no se escribe a mano, asi
  // que no puede repetirse ni hay nada que avisar sobre el aqui.
  const unitWithPlate = isValidPlate(form.plate) ? units.find(u => u.plate === form.plate) : undefined;
  const retiredMatch = unitWithPlate?.status === 'BAJA' ? unitWithPlate : undefined;
  const plateMessage = unitWithPlate
    ? unitWithPlate.status === 'BAJA'
      ? `La placa ${form.plate} pertenece a la unidad ${unitWithPlate.code}, dada de baja antes.`
      : `La placa ${form.plate} ya está registrada en la unidad ${unitWithPlate.code}.`
    : '';
  const [restoringRetired, setRestoringRetired] = useState(false);

  const restoreRetired = async () => {
    if (!retiredMatch) return;
    setRestoringRetired(true);
    setError('');
    try {
      await restoreVehicle(retiredMatch.id);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo restaurar la unidad.');
    } finally {
      setRestoringRetired(false);
    }
  };

  const validateStep = (target: WizardStep): string => {
    if (target === 1) {
      if (!form.companyId) return 'Selecciona la empresa integrante.';
    }
    if (target === 2) {
      if (!isValidPlate(form.plate)) return PLATE_ERROR;
      if (plateMessage) return plateMessage;
      if (!brandInfo) return 'Selecciona la marca.';
      if (!isValidYear(form.year)) return YEAR_ERROR();
    }
    return '';
  };

  const handleNext = () => {
    const message = validateStep(step);
    if (message) { setError(message); return; }
    setError('');
    if (step < 3) setStep((step + 1) as WizardStep);
  };
  const handlePrev = () => { setError(''); if (step > 1) setStep((step - 1) as WizardStep); };

  const saveRegistration = async () => {
    const message = validateStep(1) || validateStep(2);
    if (message || !brandInfo) { setError(message); return; }
    setSaving(true);
    setError('');
    try {
      const created = await createVehicle({
        companyId: form.companyId,
        vehicleType: brandInfo.type,
        plate: form.plate,
        model: `${brandInfo.brand} ${brandInfo.model}`,
        year: Number(form.year),
        routeAssignment: 'AMBAS',
      });
      setAssignedCode(created.code);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la unidad.');
    } finally {
      setSaving(false);
    }
  };

  if (assignedCode) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
        <div className="bg-surface rounded-lg shadow-xl w-full max-w-md p-8 text-center">
          <CheckCircle size={40} className="text-ok mx-auto mb-4" />
          <h3 className="text-base font-semibold text-t1 mb-2">Unidad registrada</h3>
          <p className="text-sm text-t2 mb-2">Se le asignó el código <strong>{assignedCode}</strong>.</p>
          <p className="text-xs text-muted mb-6">Registro en auditoría. La unidad queda disponible para vincularla después con un socio y un conductor desde Personas.</p>
          <button onClick={onCreated} className="px-6 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h">
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
            <h3 className="text-sm font-semibold text-t1">Registrar unidad</h3>
            <p className="text-xs text-t2 mt-0.5">Paso {step} de {STEP_LABELS.length}: {STEP_LABELS[step - 1]}</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-t1 p-1" aria-label="Cerrar"><X size={18} /></button>
        </div>

        <div className="px-6 pt-4 flex gap-1.5">
          {STEP_LABELS.map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full ${i < step ? 'bg-primary' : 'bg-border'}`} />
          ))}
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-4">
          {step === 1 && (
            <div>
              <label className="block text-xs font-medium text-t1 mb-1">Empresa integrante <span className="text-danger">*</span></label>
              <select value={form.companyId} onChange={e => set('companyId', e.target.value)} className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">Seleccionar empresa…</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <p className="text-[11px] text-muted mt-1">El código de la unidad lo asigna el sistema automáticamente al finalizar.</p>
            </div>
          )}

          {step === 2 && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-t1 mb-1">Placa <span className="text-danger">*</span></label>
                <input
                  value={form.plate}
                  onChange={e => set('plate', sanitizePlate(e.target.value, form.plate))}
                  placeholder="Z0A-001"
                  autoComplete="off"
                  className={`w-full h-9 px-3 border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary ${plateMessage ? 'border-danger' : 'border-border'}`}
                />
                {plateMessage
                  ? <p className="text-[11px] text-danger mt-1">{plateMessage}</p>
                  : <p className="text-[11px] text-muted mt-1">3 letras o números y luego 3 números. El guion se pone solo.</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-t1 mb-1">Marca <span className="text-danger">*</span></label>
                <select value={form.brand} onChange={e => set('brand', e.target.value)} className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                  <option value="">Seleccionar marca…</option>
                  {VEHICLE_BRANDS.map(b => <option key={b.brand} value={b.brand}>{b.brand}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-t1 mb-1">Modelo</label>
                <input value={brandInfo?.model ?? ''} readOnly tabIndex={-1} placeholder="Se completa al elegir la marca" className="w-full h-9 px-3 border border-border rounded-lg text-sm bg-bg text-t2" />
              </div>
              <div>
                <label className="block text-xs font-medium text-t1 mb-1">Año <span className="text-danger">*</span></label>
                <input
                  value={form.year}
                  onChange={e => set('year', sanitizeYear(e.target.value))}
                  inputMode="numeric"
                  placeholder="2024"
                  autoComplete="off"
                  className="w-full h-9 px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <p className="text-[11px] text-muted mt-1">4 números, entre {YEAR_MIN} y {yearMax()}.</p>
              </div>
            </div>
          )}

          {retiredMatch && step !== 3 && (
            <div className="p-3 bg-warn/5 border border-warn/30 rounded-lg text-xs text-t1">
              <p className="font-medium">La unidad {retiredMatch.code} (placa {retiredMatch.plate}) fue dada de baja.</p>
              <p className="text-t2 mt-1">Si es la misma unidad que vuelve, restáurala con su historial en vez de registrarla de nuevo.</p>
              <button
                onClick={restoreRetired}
                disabled={restoringRetired}
                className="mt-2 px-3 py-1.5 border border-ok text-ok rounded-lg text-xs font-medium hover:bg-ok/5 disabled:opacity-50"
              >
                {restoringRetired ? 'Restaurando…' : `Restaurar unidad ${retiredMatch.code}`}
              </button>
            </div>
          )}

          {error && step !== 3 && <p className="text-xs text-danger">{error}</p>}

          {step === 3 && (
            <div className="space-y-4">
              <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                <h4 className="text-sm font-semibold text-t1">La unidad se registra primero</h4>
                <p className="text-xs text-t2 mt-2">Al finalizar quedará sin propietario y sin conductor. Después:</p>
                <ol className="mt-3 space-y-2 text-xs text-t2 list-decimal pl-5">
                  <li>Registra al socio desde Personas → Socios y selecciona esta unidad como propiedad.</li>
                  <li>Registra al conductor desde Personas → Conductores y selecciona la unidad que manejará.</li>
                  <li>Si el socio conduce su propio vehículo, agrega también su rol de conductor sin crear otra cuenta.</li>
                </ol>
              </div>
              <p className="text-[11px] text-muted">El dispositivo GPS (si aplica) lo vincula Super Admin tras la instalación física del hardware — no se configura desde este registro.</p>
              <div className="border border-border rounded-lg divide-y divide-border text-xs">
                {[
                  { label: 'Código', value: 'Se asignará automáticamente' },
                  { label: 'Empresa', value: companies.find(c => c.id === form.companyId)?.name || '—' },
                  { label: 'Placa', value: form.plate || '—', mono: true },
                  { label: 'Modelo', value: [brandInfo?.brand, brandInfo?.model, form.year].filter(Boolean).join(' ') || '—' },
                ].map(row => (
                  <div key={row.label} className="flex justify-between px-3 py-2">
                    <span className="text-t2">{row.label}</span>
                    <span className={`text-t1 font-medium ${row.mono ? 'font-mono' : ''}`}>{row.value}</span>
                  </div>
                ))}
              </div>
              {error && <p className="text-xs text-danger">{error}</p>}
              <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg text-xs text-t2">
                Al confirmar, el registro queda en auditoría con tu identidad y marca de tiempo.
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <button onClick={step === 1 ? onClose : handlePrev} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-hover">
            {step === 1 ? 'Cancelar' : 'Anterior'}
          </button>
          {step < 3 ? (
            <button onClick={handleNext} className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-h flex items-center gap-2">
              Siguiente <ChevronRight size={14} />
            </button>
          ) : (
            <button onClick={saveRegistration} disabled={saving} className="px-4 py-2 text-sm bg-ok text-white rounded-lg hover:bg-ok/80 flex items-center gap-2 disabled:opacity-50">
              <CheckCircle size={14} /> {saving ? 'Registrando…' : 'Confirmar registro'}
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
  // Por defecto solo activos -- las dadas de baja no deben mezclarse con la
  // flota operativa a simple vista, pero siguen accesibles eligiendo
  // "Todos los estados" o "SUSPENDIDO"/"INACTIVO" aqui mismo (su historial de
  // viajes/GPS nunca se borra, ver Vehicle.status vs registros de Trip).
  const [filterStatus, setFilterStatus] = useState('ACTIVO');
  const [selected, setSelected] = useState<Unit | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [units, setUnits] = useState<Unit[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [gpsDevices, setGpsDevices] = useState<VehicleGpsStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const { isPRO } = useAdminDemo();
  const [selectMode, setSelectMode] = useState(false);
  const [checked, setChecked] = useState<string[]>([]);
  const [showBulk, setShowBulk] = useState(false);
  const [bulkReason, setBulkReason] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [bulkResult, setBulkResult] = useState<{ retired: string[]; failed: { code: string; message: string }[] } | null>(null);

  const reload = () => {
    setLoadError('');
    Promise.all([fetchVehicles(undefined, undefined, true), fetchCompanies(), fetchPeople(), fetchGpsDevices()])
      .then(([u, c, p, d]) => { setUnits(u); setCompanies(c); setPeople(p); setGpsDevices(d); })
      .catch(err => setLoadError(err instanceof Error ? err.message : 'No se pudo cargar la flota.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchVehicles(undefined, undefined, true), fetchCompanies(), fetchPeople(), fetchGpsDevices()])
      .then(([u, c, p, d]) => { if (!cancelled) { setUnits(u); setCompanies(c); setPeople(p); setGpsDevices(d); } })
      .catch(err => { if (!cancelled) setLoadError(err instanceof Error ? err.message : 'No se pudo cargar la flota.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filtered = units.filter(u => {
    const q = search.toLowerCase();
    const matchSearch = !q || u.code.includes(q) || u.plate.toLowerCase().includes(q) ||
      (u.currentDriverName?.toLowerCase().includes(q) ?? false) || u.partnerName.toLowerCase().includes(q);
    const matchCompany = !filterCompany || u.company === filterCompany;
    const matchStatus = filterStatus ? u.status === filterStatus : u.status !== 'BAJA';
    return matchSearch && matchCompany && matchStatus;
  });

  const deviceFor = (unit: Unit) => gpsDevices.find(d => d.vehicleId === unit.id);

  // Solo cuentan las marcadas que siguen visibles con el filtro actual: asi
  // nunca se da de baja algo que la persona ya no ve en pantalla.
  const selectable = filtered.filter(u => u.status !== 'BAJA');
  const checkedUnits = selectable.filter(u => checked.includes(u.id));
  const allChecked = selectable.length > 0 && checkedUnits.length === selectable.length;
  const toggleOne = (id: string) => setChecked(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  const toggleAll = () => setChecked(allChecked ? [] : selectable.map(u => u.id));

  const closeBulk = () => { setShowBulk(false); setBulkReason(''); setBulkError(''); };
  const exitSelectMode = () => { setSelectMode(false); setChecked([]); };

  const confirmBulk = async () => {
    if (!bulkReason || checkedUnits.length === 0) return;
    setBulkBusy(true);
    setBulkError('');
    try {
      const result = await retireVehicles(checkedUnits.map(u => u.id), bulkReason);
      setBulkResult(result);
      exitSelectMode();
      setSelected(null);
      closeBulk();
      reload();
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : 'No se pudieron dar de baja las unidades.');
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 md:px-6 py-4 border-b border-border bg-surface flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold text-t1">Unidades y flota</h1>
          <p className="text-xs text-t2 mt-0.5">{units.filter(u => u.status !== 'BAJA').length} unidades registradas · Mostrando {filtered.length}</p>
        </div>
        <div className="flex items-center gap-2">
          {!selectMode && (
            <button
              onClick={() => { setSelected(null); setSelectMode(true); }}
              className="px-4 py-2 border border-border rounded-lg text-sm text-t1 hover:bg-hover transition-colors"
            >
              Dar de baja unidades
            </button>
          )}
          <button
            onClick={() => setShowWizard(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h transition-colors"
          >
            <Plus size={15} /> Registrar unidad
          </button>
        </div>
      </div>

      <div className="px-4 md:px-6 py-3 border-b border-border bg-surface flex items-center gap-3 flex-wrap">
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
          {['ACTIVO', 'INACTIVO', 'SUSPENDIDO', 'BAJA'].map(s => <option key={s} value={s}>{UNIT_STATUS_LABEL[s] ?? s}</option>)}
        </select>
        <span className="text-xs text-t2 ml-auto">{filtered.length} unidades</span>
      </div>

      {loadError && (
        <div className="px-6 py-3 bg-danger/5 border-b border-danger/20 text-sm text-danger">{loadError}</div>
      )}

      {selectMode && (
        <div className="px-6 py-2.5 bg-primary/5 border-b border-primary/20 flex items-center gap-3 flex-wrap text-sm">
          <span className="text-t1 font-medium">
            {checkedUnits.length === 0
              ? 'Marca las unidades que quieres dar de baja'
              : `${checkedUnits.length} ${checkedUnits.length === 1 ? 'unidad seleccionada' : 'unidades seleccionadas'}`}
          </span>
          <button
            onClick={toggleAll}
            disabled={selectable.length === 0}
            className="px-3 py-1.5 border border-border rounded-lg text-xs text-t1 hover:bg-hover disabled:opacity-50"
          >
            {allChecked ? 'Quitar todas' : `Seleccionar todas (${selectable.length})`}
          </button>
          <button
            onClick={() => setShowBulk(true)}
            disabled={checkedUnits.length === 0}
            className="px-3 py-1.5 bg-danger text-white rounded-lg text-xs font-medium hover:bg-danger/80 disabled:opacity-40"
          >
            Dar de baja{checkedUnits.length > 0 ? ` (${checkedUnits.length})` : ''}
          </button>
          <button onClick={exitSelectMode} className="px-3 py-1.5 border border-border rounded-lg text-xs text-t2 hover:bg-hover ml-auto">
            Cancelar
          </button>
        </div>
      )}

      {bulkResult && (
        <div className={`px-6 py-3 border-b text-sm flex items-start justify-between gap-4 ${bulkResult.failed.length ? 'bg-warn/5 border-warn/30' : 'bg-ok/5 border-ok/30'}`}>
          <div className="space-y-1">
            <p className="text-t1 font-medium">
              {bulkResult.retired.length} {bulkResult.retired.length === 1 ? 'unidad dada de baja' : 'unidades dadas de baja'}
              {bulkResult.failed.length > 0 && ` · ${bulkResult.failed.length} no se pudieron`}
            </p>
            {bulkResult.failed.map(f => (
              <p key={f.code} className="text-xs text-t2">Unidad {f.code}: {f.message}</p>
            ))}
          </div>
          <button onClick={() => setBulkResult(null)} className="text-muted hover:text-t1 p-1 flex-shrink-0" aria-label="Cerrar aviso"><X size={14} /></button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className={`flex-1 overflow-auto ${selected ? 'border-r border-border' : ''}`}>
          {loading ? (
            <p className="p-10 text-center text-sm text-t2">Cargando flota…</p>
          ) : (
          <table className="w-full text-xs" aria-label="Tabla de unidades">
            <thead className="sticky top-0">
              <tr className="border-b border-border bg-bg">
                {selectMode && (
                  <th className="w-8 pl-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      onChange={toggleAll}
                      disabled={selectable.length === 0}
                      aria-label="Seleccionar todas las unidades mostradas"
                      className="accent-primary"
                    />
                  </th>
                )}
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
              {filtered.map(unit => {
                const device = deviceFor(unit);
                const online = device?.online === 'online';
                return (
                <tr
                  key={unit.id}
                  className={`border-b border-border last:border-0 hover:bg-hover cursor-pointer ${selected?.id === unit.id ? 'bg-hover' : ''}`}
                  onClick={() => (selectMode ? (unit.status !== 'BAJA' && toggleOne(unit.id)) : setSelected(selected?.id === unit.id ? null : unit))}
                >
                  {selectMode && (
                    <td className="pl-4 py-3 w-8" onClick={e => e.stopPropagation()}>
                      {unit.status !== 'BAJA' && (
                        <input
                          type="checkbox"
                          checked={checked.includes(unit.id)}
                          onChange={() => toggleOne(unit.id)}
                          aria-label={`Seleccionar unidad ${unit.code}`}
                          className="accent-primary"
                        />
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3 font-bold text-t1">{unit.code}</td>
                  <td className="px-4 py-3 text-t2">{unit.company}</td>
                  <td className="px-4 py-3 text-t1 max-w-[120px] truncate">{unit.partnerName || '—'}</td>
                  <td className="px-4 py-3 text-t2">{unit.vehicleType}</td>
                  <td className="px-4 py-3 font-mono text-t1">{unit.plate}</td>
                  <td className="px-4 py-3 text-t1 max-w-[120px] truncate">
                    {unit.currentDriverName || <span className="text-muted italic">Sin conductor</span>}
                  </td>
                  <td className="px-4 py-3 text-t2">{unit.route}</td>
                  <td className="px-4 py-3">
                    {unit.traccarDeviceId ? (
                      <span className={'text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 w-fit ' + (online ? 'bg-ok/10 text-ok' : 'bg-border text-muted')}>
                        {online ? <><Wifi size={9} /> {isPRO ? 'PRO' : 'Particular'}</> : <><WifiOff size={9} /> Sin señal</>}
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${UNIT_STATUS_STYLE[unit.status]}`}>
                      {UNIT_STATUS_LABEL[unit.status] ?? unit.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <ChevronRight size={14} className="text-muted" />
                  </td>
                </tr>
              );})}
            </tbody>
          </table>
          )}
        </div>

        {selected && (
          <UnitDetailPanel
            unit={selected}
            people={people}
            gpsStatus={deviceFor(selected)}
            onClose={() => setSelected(null)}
            onChanged={reload}
          />
        )}
      </div>

      {showBulk && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-label="Dar de baja unidades seleccionadas">
          <div className="bg-surface rounded-lg shadow-xl w-full max-w-md p-6">
            <h3 className="text-sm font-semibold text-t1 mb-1">
              Dar de baja {checkedUnits.length} {checkedUnits.length === 1 ? 'unidad' : 'unidades'}
            </h3>
            <p className="text-xs text-t2 mb-3">
              Dejan de operar y desaparecen de la flota. El historial se conserva y puedes restaurarlas después. Las que tengan un viaje en curso o estén en una cola no se darán de baja y te avisaremos cuáles.
            </p>
            <div className="flex flex-wrap gap-1.5 mb-4 max-h-24 overflow-auto">
              {checkedUnits.map(u => (
                <span key={u.id} className="text-[11px] px-2 py-0.5 rounded bg-bg border border-border text-t1 font-mono">{u.code}</span>
              ))}
            </div>
            <select value={bulkReason} onChange={e => setBulkReason(e.target.value)} className="w-full h-9 px-3 border border-border rounded-lg text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="">Seleccionar motivo…</option>
              {RETIRE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            {bulkError && <p className="text-xs text-danger mb-3">{bulkError}</p>}
            <div className="flex gap-3 justify-end">
              <button onClick={closeBulk} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-hover">Cancelar</button>
              <button onClick={confirmBulk} disabled={!bulkReason || bulkBusy} className="px-4 py-2 text-sm bg-danger text-white rounded-lg hover:bg-danger/80 disabled:opacity-50">
                {bulkBusy ? 'Dando de baja…' : 'Dar de baja'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showWizard && (
        <RegisterWizard
          companies={companies}
          units={units}
          onClose={() => setShowWizard(false)}
          onCreated={() => { setShowWizard(false); reload(); }}
        />
      )}
    </div>
  );
}
