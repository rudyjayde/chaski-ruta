import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  CheckCircle,
  ChevronRight,
  Link2,
  Search,
  Smartphone,
  UserPlus,
  X,
} from 'lucide-react';
import type { Person, Unit } from '../../types';
import { useAdminDemo } from './AdminApp';
import { useAuth } from '../../contexts/AuthContext';
import {
  fetchPeople, createPerson, type CreatePersonInput,
  fetchVehicles, fetchCompanies, type CompanyOption,
  changeVehiclePartner, changeVehicleDriver, updatePersonStatus, updatePersonLicense, resetPersonDevice,
} from '../../lib/operacion-api';
import { DNI_ERROR, PHONE_ERROR, LICENSE_ERROR, dniInputProps, phoneInputProps, sanitizeDni, sanitizePhone, sanitizeLicense, isValidDni, isValidPhone, isValidLicense, isValidOptionalDni, isValidOptionalPhone, maskLicense, formatLicenseExpiry, licenseExpiryInputValue, licenseDatesError, licenseStatus, todayInputValue } from '../../lib/validators';

type PersonTab = 'conductores' | 'socios' | 'administradores' | 'pendientes';

const maskDni = (dni?: string | null) => !dni || dni === '00000000' ? 'Pendiente' : dni.slice(0, 2) + '****' + dni.slice(-2);

const STATUS_STYLE: Record<string, string> = {
  ACTIVO: 'bg-ok/10 text-ok',
  INACTIVO: 'bg-t2/10 text-t2',
  PENDIENTE: 'bg-warn/10 text-warn',
  SUSPENDIDO: 'bg-danger/10 text-danger',
};

const inputClass = 'w-full h-9 px-3 border border-border rounded-lg text-sm text-t1 bg-surface focus:outline-none focus:ring-2 focus:ring-primary';

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-t1 mb-1">
        {label}{required && <span className="text-danger"> *</span>}
      </span>
      {children}
    </label>
  );
}

const isUnassignedOwner = (unit: Unit) => !unit.partnerId;
const isUnassignedDriver = (unit: Unit) => !unit.currentDriverId;

interface SocioForm {
  name: string;
  dni: string;
  email: string;
  phone: string;
  company: string;
  vehicleCodes: string[];
  drivesOwn: boolean;
  driverUnit: string;
  license: string;
  licenseCategory: string;
  licenseIssuedAt: string;
  licenseExpiry: string;
}

const EMPTY_SOCIO: SocioForm = {
  name: '', dni: '', email: '', phone: '', company: '', vehicleCodes: [],
  drivesOwn: false, driverUnit: '', license: '', licenseCategory: '', licenseIssuedAt: '', licenseExpiry: '',
};

function RegisterSocioModal({
  people,
  units,
  companies,
  onClose,
  onCreated,
}: {
  people: Person[];
  units: Unit[];
  companies: CompanyOption[];
  onClose: () => void;
  onCreated: (message: string) => void;
}) {
  const [form, setForm] = useState<SocioForm>(EMPTY_SOCIO);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [vehicleSearch, setVehicleSearch] = useState('');
  const set = (key: keyof SocioForm, value: string | string[] | boolean) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setError('');
  };

  const availableUnits = units.filter(unit =>
    unit.status === 'ACTIVO' &&
    isUnassignedOwner(unit) &&
    (!form.company || unit.company === form.company)
  );

  const normalizedVehicleSearch = vehicleSearch.trim().toUpperCase();
  const searchedUnit = units.find(unit => unit.code.toUpperCase() === normalizedVehicleSearch);
  const foundUnit = availableUnits.find(unit => unit.code.toUpperCase() === normalizedVehicleSearch);

  const toggleVehicle = (code: string) => {
    const next = form.vehicleCodes.includes(code)
      ? form.vehicleCodes.filter(item => item !== code)
      : [...form.vehicleCodes, code];
    set('vehicleCodes', next);
    if (!next.includes(form.driverUnit)) set('driverUnit', '');
  };

  const linkFoundVehicle = () => {
    if (!foundUnit || form.vehicleCodes.includes(foundUnit.code)) return;
    set('vehicleCodes', [...form.vehicleCodes, foundUnit.code]);
    setVehicleSearch('');
  };

  const save = async () => {
    const email = form.email.trim().toLowerCase();
    if (!form.name.trim() || !isValidDni(form.dni) || !email || !isValidPhone(form.phone) || !form.company) {
      return setError('Completa los datos del socio. El DNI debe tener 8 dígitos y el teléfono 9.');
    }
    if (people.some(person => person.email.toLowerCase() === email && person.role === 'SOCIO')) {
      return setError('Ya existe una cuenta de socio con ese correo. Abre su perfil para vincularle vehículos sin crear otra cuenta.');
    }
    if (form.drivesOwn && (!form.driverUnit || !form.license || !form.licenseCategory || !form.licenseIssuedAt || !form.licenseExpiry)) {
      return setError('Selecciona la unidad que manejará y completa los datos de su licencia.');
    }
    if (form.drivesOwn && !isValidLicense(form.license)) {
      return setError(LICENSE_ERROR);
    }
    if (form.drivesOwn && licenseDatesError(form.licenseIssuedAt, form.licenseExpiry)) {
      return setError(licenseDatesError(form.licenseIssuedAt, form.licenseExpiry));
    }

    setSaving(true);
    setError('');
    try {
      const socio = await createPerson({
        name: form.name.trim(),
        email,
        role: 'SOCIO',
        dni: form.dni,
        phone: form.phone,
        company: form.company,
      });
      let conductor: Person | undefined;
      if (form.drivesOwn) {
        conductor = await createPerson({
          name: form.name.trim(),
          email,
          role: 'CONDUCTOR',
          dni: form.dni,
          phone: form.phone,
          company: form.company,
          code: form.driverUnit,
          license: form.license,
          licenseCategory: form.licenseCategory.trim(),
          licenseIssuedAt: form.licenseIssuedAt,
          licenseExpiry: form.licenseExpiry,
        });
      }

      for (const code of form.vehicleCodes) {
        const unit = units.find(item => item.code === code);
        if (!unit) continue;
        await changeVehiclePartner(unit.id, socio.id, 'Alta inicial de socio');
      }
      if (form.drivesOwn && conductor) {
        const driverUnit = units.find(item => item.code === form.driverUnit);
        if (driverUnit) await changeVehicleDriver(driverUnit.id, conductor.id, 'Alta inicial de socio-conductor');
      }

      onCreated(
        form.drivesOwn
          ? `${form.name} quedó registrado como socio y conductor de la unidad ${form.driverUnit}.`
          : `${form.name} quedó registrado como socio${form.vehicleCodes.length ? ` con ${form.vehicleCodes.length} unidad(es) vinculada(s)` : ''}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar al socio. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-label="Registrar socio">
      <div className="bg-surface rounded-lg shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-t1">Registrar socio</h3>
            <p className="text-sm text-t2 mt-0.5">Registra sus datos y vincula los vehículos que ya existen en la flota.</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar"><X size={17} /></button>
        </div>
        <div className="p-6 overflow-auto space-y-5">
          {error && <div className="p-3 bg-danger/5 border border-danger/30 rounded-lg text-sm text-danger">{error}</div>}
          <fieldset>
            <legend className="text-base font-semibold text-t1 mb-3">Datos personales y acceso</legend>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Nombre completo" required><input className={inputClass} value={form.name} onChange={e => set('name', e.target.value)} /></Field>
              <Field label="DNI" required><input className={inputClass} {...dniInputProps} value={form.dni} onChange={e => set('dni', sanitizeDni(e.target.value))} /></Field>
              <Field label="Correo de acceso" required><input inputMode="email" className={inputClass} value={form.email} onChange={e => set('email', e.target.value)} /></Field>
              <Field label="Teléfono" required><input className={inputClass} {...phoneInputProps} value={form.phone} onChange={e => set('phone', sanitizePhone(e.target.value))} /></Field>
              <div className="col-span-2">
                <Field label="Empresa integrante" required>
                  <select className={inputClass} value={form.company} onChange={e => { set('company', e.target.value); set('vehicleCodes', []); set('driverUnit', ''); setVehicleSearch(''); }}>
                    <option value="">Seleccionar empresa...</option>
                    {companies.map(company => <option key={company.id} value={company.name}>{company.name}</option>)}
                  </select>
                </Field>
              </div>
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-base font-semibold text-t1 mb-1">Vehículos del socio</legend>
            <p className="text-sm text-t2 mb-3">Digita el código de una unidad registrada. Sus datos se completarán automáticamente antes de vincularla.</p>
            {!form.company ? (
              <div className="p-4 bg-bg border border-border rounded-lg text-sm text-t2">Selecciona primero la empresa integrante.</div>
            ) : (
              <div className="space-y-3">
                {availableUnits.length === 0 && form.vehicleCodes.length === 0 && !normalizedVehicleSearch && (
                  <div className="p-3 bg-bg border border-border rounded-lg text-sm text-t2">No hay unidades libres en esta empresa. Puedes consultar un código para verificar su situación o registrar primero el vehículo en Unidades y flota.</div>
                )}
                <div>
                  <label className="block text-sm font-medium text-t1 mb-1">Código de unidad</label>
                  <div className="relative">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                    <input
                      className={inputClass + ' pl-9 font-mono'}
                      value={vehicleSearch}
                      onChange={e => setVehicleSearch(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); linkFoundVehicle(); } }}
                      placeholder="Ej. 032"
                      aria-label="Buscar unidad por código"
                    />
                  </div>
                </div>

                {normalizedVehicleSearch && !searchedUnit && (
                  <div className="p-3 bg-warn/5 border border-warn/30 rounded-lg text-sm text-warn">No existe una unidad registrada con el código {normalizedVehicleSearch}.</div>
                )}
                {searchedUnit && searchedUnit.company !== form.company && (
                  <div className="p-3 bg-warn/5 border border-warn/30 rounded-lg text-sm text-warn">La unidad {searchedUnit.code} pertenece a {searchedUnit.company}. Cambia la empresa o verifica el código.</div>
                )}
                {searchedUnit && searchedUnit.company === form.company && !isUnassignedOwner(searchedUnit) && !form.vehicleCodes.includes(searchedUnit.code) && (
                  <div className="p-3 bg-warn/5 border border-warn/30 rounded-lg text-sm text-warn">La unidad {searchedUnit.code} ya tiene un socio titular.</div>
                )}
                {foundUnit && !form.vehicleCodes.includes(foundUnit.code) && (
                  <div className="border border-primary/30 rounded-lg overflow-hidden">
                    <div className="px-4 py-2.5 bg-primary/5 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-t1">Unidad encontrada: {foundUnit.code}</p>
                        <p className="text-sm text-t2">Datos obtenidos del registro de flota</p>
                      </div>
                      <button type="button" onClick={linkFoundVehicle} className="h-8 px-3 bg-primary text-white rounded-md text-sm font-medium">Vincular unidad</button>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-5 gap-y-3 p-4 text-sm">
                      <div><dt className="text-t2">Placa</dt><dd className="font-mono font-medium text-t1 mt-0.5">{foundUnit.plate}</dd></div>
                      <div><dt className="text-t2">Empresa</dt><dd className="font-medium text-t1 mt-0.5">{foundUnit.company}</dd></div>
                      <div><dt className="text-t2">Marca y modelo</dt><dd className="font-medium text-t1 mt-0.5">{foundUnit.model || foundUnit.vehicleType}</dd></div>
                      <div><dt className="text-t2">Año</dt><dd className="font-medium text-t1 mt-0.5">{foundUnit.year || 'No registrado'}</dd></div>
                      <div><dt className="text-t2">Tipo</dt><dd className="font-medium text-t1 mt-0.5">{foundUnit.vehicleType}</dd></div>
                      <div><dt className="text-t2">Estado</dt><dd className="font-medium text-ok mt-0.5">{foundUnit.status}</dd></div>
                    </dl>
                  </div>
                )}

                {form.vehicleCodes.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-t1 mb-2">Unidades vinculadas ({form.vehicleCodes.length})</p>
                    <div className="space-y-2">
                      {form.vehicleCodes.map(code => {
                        const unit = units.find(item => item.code === code);
                        if (!unit) return null;
                        return (
                          <div key={code} className="flex items-center justify-between gap-3 px-3 py-2.5 border border-border rounded-lg">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-t1">Unidad {unit.code}</p>
                              <p className="text-sm text-t2 truncate">{unit.plate} · {unit.model} · {unit.company}</p>
                            </div>
                            <button type="button" onClick={() => toggleVehicle(code)} aria-label={`Quitar unidad ${code}`} className="w-8 h-8 flex items-center justify-center text-t2 hover:text-danger hover:bg-danger/5 rounded-md"><X size={15} /></button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </fieldset>

          <fieldset className="border border-border rounded-lg p-4">
            <label className="flex items-center justify-between gap-4 cursor-pointer">
              <span><strong className="block text-sm text-t1">Este socio también manejará una de sus unidades</strong><span className="text-sm text-t2">Usará la misma persona, correo y cuenta; no se creará un conductor duplicado.</span></span>
              <input type="checkbox" checked={form.drivesOwn} onChange={e => set('drivesOwn', e.target.checked)} />
            </label>
            {form.drivesOwn && (
              <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-border">
                <div className="col-span-2">
                  <Field label="Unidad que manejará" required>
                    <select className={inputClass} value={form.driverUnit} onChange={e => set('driverUnit', e.target.value)}>
                      <option value="">Seleccionar unidad vinculada...</option>
                      {units.filter(unit => form.vehicleCodes.includes(unit.code)).map(unit => <option key={unit.code} value={unit.code}>{unit.code} · {unit.plate} · {unit.model}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="Número de licencia" required><input className={`${inputClass} font-mono`} placeholder="Q12345678" autoComplete="off" value={form.license} onChange={e => set('license', sanitizeLicense(e.target.value))} /></Field>
                <Field label="Categoría" required><input className={inputClass} placeholder="Ej. A-IIb" value={form.licenseCategory} onChange={e => set('licenseCategory', e.target.value)} /></Field>
                <Field label="Fecha de emisión" required><input type="date" max={todayInputValue()} className={inputClass} value={form.licenseIssuedAt} onChange={e => set('licenseIssuedAt', e.target.value)} /></Field>
                <Field label="Vencimiento" required><input type="date" className={inputClass} value={form.licenseExpiry} onChange={e => set('licenseExpiry', e.target.value)} /></Field>
              </div>
            )}
          </fieldset>

          <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg text-sm text-t2">
            {form.drivesOwn
              ? 'Se crearán dos cuentas reales con este correo: Socio y Conductor. Nunca se mezclan en una sola cuenta — al iniciar sesión con Google, el sistema preguntará a cuál panel quiere entrar.'
              : 'El correo quedará autorizado para activar la cuenta de Socio.'}
          </div>
        </div>
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg">Cancelar</button>
          <button onClick={save} disabled={saving} className="px-5 py-2 text-sm bg-primary text-white rounded-lg font-medium disabled:opacity-50">{saving ? 'Guardando…' : 'Registrar socio'}</button>
        </div>
      </div>
    </div>
  );
}

interface DriverForm {
  name: string;
  dni: string;
  email: string;
  phone: string;
  unitCode: string;
  license: string;
  licenseCategory: string;
  licenseIssuedAt: string;
  licenseExpiry: string;
}

const EMPTY_DRIVER: DriverForm = {
  name: '', dni: '', email: '', phone: '', unitCode: '',
  license: '', licenseCategory: '', licenseIssuedAt: '', licenseExpiry: '',
};

function RegisterDriverModal({
  people,
  units,
  onClose,
  onCreated,
}: {
  people: Person[];
  units: Unit[];
  onClose: () => void;
  onCreated: (message: string) => void;
}) {
  const [form, setForm] = useState<DriverForm>(EMPTY_DRIVER);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (key: keyof DriverForm, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setError('');
  };

  const availableUnits = units.filter(unit => unit.status === 'ACTIVO' && isUnassignedDriver(unit));
  const selectedUnit = units.find(unit => unit.code === form.unitCode);
  const existingConductor = people.find(person =>
    person.role === 'CONDUCTOR' &&
    ((form.email && person.email.toLowerCase() === form.email.trim().toLowerCase()) || (form.dni && person.dni === form.dni))
  );

  const save = async () => {
    const email = form.email.trim().toLowerCase();
    if (!form.name.trim() || !isValidDni(form.dni) || !email || !isValidPhone(form.phone)) {
      return setError('Completa los datos del conductor. El DNI debe tener 8 dígitos y el teléfono 9.');
    }
    if (!selectedUnit || !form.license || !form.licenseCategory || !form.licenseIssuedAt || !form.licenseExpiry) {
      return setError('Selecciona la unidad y completa todos los datos de la licencia.');
    }
    if (!isValidLicense(form.license)) {
      return setError(LICENSE_ERROR);
    }
    if (licenseDatesError(form.licenseIssuedAt, form.licenseExpiry)) {
      return setError(licenseDatesError(form.licenseIssuedAt, form.licenseExpiry));
    }
    if (existingConductor) {
      return setError('Esta persona ya tiene el rol de conductor. Usa Vincular o cambiar unidad desde su perfil.');
    }

    setSaving(true);
    setError('');
    try {
      const conductor = await createPerson({
        name: form.name.trim(),
        email,
        role: 'CONDUCTOR',
        dni: form.dni,
        phone: form.phone,
        company: selectedUnit.company,
        code: selectedUnit.code,
        license: form.license,
        licenseCategory: form.licenseCategory.trim(),
        licenseIssuedAt: form.licenseIssuedAt,
        licenseExpiry: form.licenseExpiry,
      });
      await changeVehicleDriver(selectedUnit.id, conductor.id, 'Alta inicial de conductor');
      onCreated(`${form.name} quedó asignado a la unidad ${selectedUnit.code} y su correo quedó autorizado.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar al conductor. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-label="Registrar conductor">
      <div className="bg-surface rounded-lg shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-t1">Registrar conductor</h3>
            <p className="text-sm text-t2 mt-0.5">Registra su perfil, licencia, correo de acceso y unidad de trabajo.</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar"><X size={17} /></button>
        </div>
        <div className="p-6 overflow-auto space-y-5">
          {error && <div className="p-3 bg-danger/5 border border-danger/30 rounded-lg text-sm text-danger">{error}</div>}
          <fieldset>
            <legend className="text-base font-semibold text-t1 mb-3">Datos personales y acceso</legend>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Nombre completo" required><input className={inputClass} value={form.name} onChange={e => set('name', e.target.value)} /></Field>
              <Field label="DNI" required><input className={inputClass} {...dniInputProps} value={form.dni} onChange={e => set('dni', sanitizeDni(e.target.value))} /></Field>
              <Field label="Correo autorizado" required><input inputMode="email" className={inputClass} value={form.email} onChange={e => set('email', e.target.value)} /></Field>
              <Field label="Teléfono" required><input className={inputClass} {...phoneInputProps} value={form.phone} onChange={e => set('phone', sanitizePhone(e.target.value))} /></Field>
            </div>
          </fieldset>

          {people.some(p => p.role === 'SOCIO' && form.email && p.email.toLowerCase() === form.email.trim().toLowerCase()) && (
            <div className="p-3 bg-primary/5 border border-primary/25 rounded-lg text-sm text-t2">
              Esta persona ya está registrada como socio. Se creará una cuenta de Conductor separada con el mismo correo — nunca se mezclan en una sola cuenta. Al iniciar sesión con Google podrá elegir a qué panel entrar.
            </div>
          )}

          <fieldset>
            <legend className="text-base font-semibold text-t1 mb-3">Licencia de conducir</legend>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Número de licencia" required><input className={`${inputClass} font-mono`} placeholder="Q12345678" autoComplete="off" value={form.license} onChange={e => set('license', sanitizeLicense(e.target.value))} /></Field>
              <Field label="Categoría" required><input className={inputClass} placeholder="Ej. A-IIb" value={form.licenseCategory} onChange={e => set('licenseCategory', e.target.value)} /></Field>
              <Field label="Fecha de emisión" required><input type="date" max={todayInputValue()} className={inputClass} value={form.licenseIssuedAt} onChange={e => set('licenseIssuedAt', e.target.value)} /></Field>
              <Field label="Vencimiento" required><input type="date" className={inputClass} value={form.licenseExpiry} onChange={e => set('licenseExpiry', e.target.value)} /></Field>
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-base font-semibold text-t1 mb-1">Unidad que manejará</legend>
            <p className="text-sm text-t2 mb-3">La empresa, el código, la placa y el modelo se obtienen automáticamente del vehículo.</p>
            <Field label="Vehículo disponible" required>
              <select className={inputClass} value={form.unitCode} onChange={e => set('unitCode', e.target.value)}>
                <option value="">Seleccionar por código de asociación...</option>
                {availableUnits.map(unit => <option key={unit.code} value={unit.code}>{unit.code} · {unit.plate} · {unit.model} · {unit.company}</option>)}
              </select>
            </Field>
            {selectedUnit && (
              <div className="mt-3 grid grid-cols-2 gap-2 p-3 bg-bg border border-border rounded-lg text-sm">
                <div><span className="text-t2">Empresa</span><strong className="block text-t1">{selectedUnit.company}</strong></div>
                <div><span className="text-t2">Código</span><strong className="block text-t1">{selectedUnit.code}</strong></div>
                <div><span className="text-t2">Vehículo</span><strong className="block text-t1">{selectedUnit.model}</strong></div>
                <div><span className="text-t2">Placa</span><strong className="block text-t1">{selectedUnit.plate}</strong></div>
              </div>
            )}
          </fieldset>

          <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg text-sm text-t2">
            Al guardar se autorizará este correo. La asignación del vehículo alimentará automáticamente el inicio del conductor.
          </div>
        </div>
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg">Cancelar</button>
          <button onClick={save} disabled={saving} className="px-5 py-2 text-sm bg-primary text-white rounded-lg font-medium disabled:opacity-50">{saving ? 'Guardando…' : 'Registrar conductor'}</button>
        </div>
      </div>
    </div>
  );
}

function LinkUnitModal({
  person,
  units,
  onClose,
  onSaved,
}: {
  person: Person;
  units: Unit[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [unitCode, setUnitCode] = useState(person.linkedUnit ?? '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const selectedUnit = units.find(u => u.code === unitCode);
  const replaces = selectedUnit && (person.role === 'SOCIO' ? selectedUnit.partnerName : selectedUnit.currentDriverName);

  const save = async () => {
    if (!selectedUnit) return setError('Selecciona una unidad.');
    if (replaces && !reason.trim()) return setError('Indica el motivo para conservar el historial del cambio.');

    setSaving(true);
    setError('');
    try {
      if (person.role === 'SOCIO') {
        await changeVehiclePartner(selectedUnit.id, person.id, reason.trim() || undefined);
      } else {
        await changeVehicleDriver(selectedUnit.id, person.id, reason.trim() || undefined);
      }
      onSaved(`${person.name} quedó vinculado a la unidad ${selectedUnit.code}.`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el vínculo. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4" role="dialog" aria-modal="true" aria-label="Vincular unidad">
      <div className="bg-surface rounded-lg shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4"><div><h3 className="text-base font-semibold text-t1">{person.role === 'SOCIO' ? 'Vincular vehículo al socio' : 'Asignar vehículo al conductor'}</h3><p className="text-sm text-t2 mt-1">{person.name}</p></div><button onClick={onClose} aria-label="Cerrar"><X size={16} /></button></div>
        {error && <div className="mb-3 p-2.5 bg-danger/5 text-danger border border-danger/30 rounded-lg text-sm">{error}</div>}
        <div className="space-y-4">
          <Field label="Unidad" required><select className={inputClass} value={unitCode} onChange={e => { setUnitCode(e.target.value); setError(''); }}><option value="">Seleccionar unidad...</option>{units.map(u => <option key={u.id} value={u.code}>{u.code} · {u.plate} · {u.company}</option>)}</select></Field>
          {selectedUnit && <div className="p-3 border border-border rounded-lg text-sm text-t2"><p>Socio actual: <strong className="text-t1">{selectedUnit.partnerName || 'Sin socio'}</strong></p><p className="mt-1">Conductor actual: <strong className="text-t1">{selectedUnit.currentDriverName || 'Sin conductor'}</strong></p></div>}
          <Field label="Motivo del vínculo o cambio" required><textarea className="w-full min-h-20 px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={reason} onChange={e => setReason(e.target.value)} placeholder="Alta inicial, reemplazo, transferencia u otro motivo" /></Field>
        </div>
        <div className="flex gap-3 justify-end mt-5"><button onClick={onClose} className="px-4 py-2 border border-border rounded-lg text-sm">Cancelar</button><button onClick={save} disabled={saving} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar vínculo'}</button></div>
      </div>
    </div>
  );
}

function LicenseBadge({ expiry }: { expiry?: string | null }) {
  const st = licenseStatus(expiry);
  const detail = st.days === null ? '' : st.days < 0 ? ` · hace ${-st.days} d` : ` · en ${st.days} d`;
  return <span className={`text-[11px] px-2 py-0.5 rounded font-medium whitespace-nowrap ${st.cls}`}>{st.label}{detail}</span>;
}

const licenseMatches = (p: Person, filter: string) => {
  const kind = licenseStatus(p.licenseExpiry).kind;
  return filter === 'alertas' ? kind !== 'vigente' : kind === filter;
};

// Registrar o corregir la licencia de un conductor que ya existe.
function LicenseModal({ person, onClose, onSaved }: { person: Person; onClose: () => void; onSaved: (message: string) => void }) {
  const [license, setLicense] = useState(person.license ?? '');
  const [category, setCategory] = useState(person.licenseCategory ?? '');
  const [issued, setIssued] = useState(licenseExpiryInputValue(person.licenseIssuedAt));
  const [expiry, setExpiry] = useState(licenseExpiryInputValue(person.licenseExpiry));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!isValidLicense(license)) return setError(LICENSE_ERROR);
    if (!category.trim()) return setError('Completa la categoría de la licencia.');
    const datesProblem = licenseDatesError(issued, expiry);
    if (datesProblem) return setError(datesProblem);
    setSaving(true);
    setError('');
    try {
      await updatePersonLicense(person.id, { license, licenseCategory: category.trim(), licenseIssuedAt: issued, licenseExpiry: expiry });
      onSaved(`Licencia de ${person.name} guardada.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la licencia.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4" role="dialog" aria-modal="true" aria-label="Licencia de conducir">
      <div className="bg-surface rounded-lg shadow-xl w-full max-w-sm p-6">
        <h3 className="text-sm font-semibold text-t1 mb-1">Licencia de {person.name}</h3>
        <p className="text-xs text-t2 mb-4">1 letra seguida de 8 números, por ejemplo Q12345678.</p>
        <div className="space-y-3">
          <Field label="Número de licencia" required><input className={`${inputClass} font-mono`} placeholder="Q12345678" autoComplete="off" value={license} onChange={e => { setLicense(sanitizeLicense(e.target.value)); setError(''); }} /></Field>
          <Field label="Categoría" required><input className={inputClass} placeholder="Ej. A-IIb" value={category} onChange={e => { setCategory(e.target.value); setError(''); }} /></Field>
          <Field label="Fecha de emisión" required><input type="date" max={todayInputValue()} className={inputClass} value={issued} onChange={e => { setIssued(e.target.value); setError(''); }} /></Field>
          <Field label="Vencimiento" required><input type="date" className={inputClass} value={expiry} onChange={e => { setExpiry(e.target.value); setError(''); }} /></Field>
        </div>
        {error && <p className="text-xs text-danger mt-3">{error}</p>}
        <div className="flex gap-3 justify-end mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-hover">Cancelar</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-h disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar licencia'}</button>
        </div>
      </div>
    </div>
  );
}

function PersonDetail({ person, onClose, onLink, onStatusChanged }: { person: Person; onClose: () => void; onLink: () => void; onStatusChanged: (message: string) => void }) {
  const { org } = useAdminDemo();
  const [showLicense, setShowLicense] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resettingDevice, setResettingDevice] = useState(false);

  // Excepcion 2 (plan-operacion.md §3.2): equipo perdido, robado o cambiado.
  // Solo el administrador puede liberar la vinculacion cuenta-dispositivo del
  // conductor -- el propio conductor nunca puede hacerlo desde su panel.
  const handleResetDevice = async () => {
    if (!window.confirm(`¿Liberar el dispositivo vinculado de ${person.name}? La próxima vez que use su cuenta para inscribirse en una cola, quedará vinculada al equipo que use en ese momento.`)) {
      return;
    }
    setResettingDevice(true);
    setError('');
    try {
      await resetPersonDevice(person.id);
      onStatusChanged(`Se liberó el dispositivo vinculado de ${person.name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo liberar el dispositivo.');
    } finally {
      setResettingDevice(false);
    }
  };

  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');

  const confirmSuspend = async () => {
    if (!suspendReason.trim()) return;
    setBusy(true);
    setError('');
    try {
      await updatePersonStatus(person.id, 'SUSPENDIDO', suspendReason.trim());
      setShowSuspendModal(false);
      setSuspendReason('');
      onStatusChanged(`${person.name} quedó suspendido.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el estado.');
    } finally {
      setBusy(false);
    }
  };

  const reactivate = async () => {
    setBusy(true);
    setError('');
    try {
      await updatePersonStatus(person.id, 'ACTIVO');
      onStatusChanged(`${person.name} quedó activo.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el estado.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="fixed inset-0 z-40 w-full md:static md:inset-auto md:z-auto md:w-80 md:flex-shrink-0 border-l border-border bg-surface flex flex-col" aria-label="Detalle de persona">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between"><h3 className="text-base font-semibold text-t1">Detalle</h3><button onClick={onClose} aria-label="Cerrar"><X size={16} /></button></div>
      <div className="flex-1 overflow-auto p-4 space-y-3 text-sm">
        <div className="text-center py-3"><div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg mx-auto mb-2">{person.name[0]}</div><p className="text-sm font-semibold text-t1">{person.name}</p><p className="text-t2 mt-0.5">{person.role} · {person.company ?? org?.name ?? 'Sin dato'}</p><span className={`inline-block mt-1 text-[11px] px-2 py-0.5 rounded font-medium ${STATUS_STYLE[person.status]}`}>{person.status}</span></div>
        {error && <div className="p-2.5 bg-danger/5 text-danger border border-danger/30 rounded-lg text-sm">{error}</div>}
        <div className="border border-border rounded-lg divide-y divide-border">
          {[{ label: 'DNI', value: maskDni(person.dni) }, { label: 'Correo', value: person.email }, { label: 'Teléfono', value: person.phone || 'No registrado' }, { label: 'Unidad', value: person.linkedUnit || person.code || 'Sin vincular' }].map(row => <div key={row.label} className="flex justify-between gap-3 px-3 py-2"><span className="text-t2">{row.label}</span><span className="text-t1 font-medium truncate max-w-[170px]">{row.value}</span></div>)}
        </div>
        {person.role === 'CONDUCTOR' && (
          <div className="border border-border rounded-lg p-3 space-y-2">
            <p className="text-t2">Licencia de conducir</p>
            {person.license ? (
              <div className="space-y-1">
                <p className="text-t1 font-medium">
                  <span className="font-mono">{maskLicense(person.license)}</span>
                  {' · '}{person.licenseCategory || 'Sin categoría'}
                </p>
                <p className="text-t2">
                  {person.licenseIssuedAt ? `Emitida ${formatLicenseExpiry(person.licenseIssuedAt)}` : <span className="text-warn">Falta la fecha de emisión</span>}
                  {' · vence '}{formatLicenseExpiry(person.licenseExpiry) || '—'}
                </p>
                <span className={`inline-block text-[11px] px-2 py-0.5 rounded font-medium ${licenseStatus(person.licenseExpiry).cls}`}>
                  {licenseStatus(person.licenseExpiry).label}{licenseStatus(person.licenseExpiry).days !== null ? ` · ${licenseStatus(person.licenseExpiry).days! < 0 ? `hace ${-licenseStatus(person.licenseExpiry).days!} d` : `en ${licenseStatus(person.licenseExpiry).days} d`}` : ''}
                </span>
              </div>
            ) : (
              <p className="text-warn font-medium">No registrada</p>
            )}
            <button onClick={() => setShowLicense(true)} className="w-full h-9 border border-border text-t2 rounded-lg text-sm font-medium hover:bg-hover">
              {person.license ? 'Actualizar licencia' : 'Registrar licencia'}
            </button>
          </div>
        )}
        {(person.role === 'SOCIO' || person.role === 'CONDUCTOR') && person.status !== 'PENDIENTE' && (
          <button onClick={onLink} className="w-full h-9 bg-primary text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2"><Link2 size={13} />{person.role === 'SOCIO' ? 'Vincular o cambiar vehículo' : 'Asignar o cambiar unidad'}</button>
        )}
        {person.role === 'CONDUCTOR' && person.status !== 'PENDIENTE' && (
          <div className="border border-border rounded-lg p-3 space-y-2">
            <p className="text-t2 flex items-center gap-1.5"><Smartphone size={13} />Dispositivo: <span className="text-t1 font-medium">{person.boundDeviceId ? 'Vinculado' : 'Sin vincular'}</span></p>
            {person.boundDeviceId && (
              <button onClick={handleResetDevice} disabled={resettingDevice} className="w-full h-9 border border-border text-t2 rounded-lg text-sm font-medium hover:bg-hover disabled:opacity-50">
                {resettingDevice ? 'Liberando…' : 'Reasignar dispositivo (perdido, robado o cambiado)'}
              </button>
            )}
          </div>
        )}
        {person.status !== 'PENDIENTE' && (
          <button
            onClick={() => (person.status === 'SUSPENDIDO' ? reactivate() : setShowSuspendModal(true))}
            disabled={busy}
            className={`w-full h-9 rounded-lg text-sm font-medium border disabled:opacity-50 ${person.status === 'SUSPENDIDO' ? 'border-ok text-ok hover:bg-ok/5' : 'border-danger text-danger hover:bg-danger/5'}`}
          >
            {busy ? 'Guardando…' : person.status === 'SUSPENDIDO' ? 'Reactivar cuenta' : 'Suspender cuenta'}
          </button>
        )}
      </div>

      {showLicense && (
        <LicenseModal
          person={person}
          onClose={() => setShowLicense(false)}
          onSaved={(message) => { setShowLicense(false); onStatusChanged(message); }}
        />
      )}

      {showSuspendModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4" role="dialog" aria-modal="true" aria-label="Suspender cuenta">
          <div className="bg-surface rounded-lg shadow-xl w-full max-w-sm p-6">
            <h3 className="text-sm font-semibold text-t1 mb-1">Suspender a {person.name}</h3>
            <p className="text-xs text-t2 mb-4">Su historial queda intacto. Se requiere motivo.</p>
            <textarea
              value={suspendReason}
              onChange={e => setSuspendReason(e.target.value)}
              placeholder="Motivo de la suspensión…"
              className="w-full min-h-20 px-3 py-2 border border-border rounded-lg text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {error && <p className="text-xs text-danger mb-3">{error}</p>}
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setShowSuspendModal(false); setSuspendReason(''); setError(''); }} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-hover">Cancelar</button>
              <button onClick={confirmSuspend} disabled={!suspendReason.trim() || busy} className="px-4 py-2 text-sm bg-danger text-white rounded-lg hover:bg-danger/80 disabled:opacity-50">
                {busy ? 'Suspendiendo…' : 'Suspender'}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

const ROLE_LABEL_REAL: Record<CreatePersonInput['role'], string> = {
  ADMINISTRADOR: 'Administrador',
  SOCIO: 'Socio',
  CONDUCTOR: 'Conductor',
};

function CreatePersonModal({
  fixedRole,
  title,
  onClose,
  onCreated,
}: {
  fixedRole?: CreatePersonInput['role'];
  title: string;
  onClose: () => void;
  onCreated: (message: string) => void;
}) {
  const [form, setForm] = useState<CreatePersonInput>({
    name: '', email: '', role: fixedRole ?? 'CONDUCTOR', dni: '', phone: '', code: '', company: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof CreatePersonInput>(key: K, value: CreatePersonInput[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setError('');
  };

  const save = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      setError('Completa al menos el nombre y el correo.');
      return;
    }
    if (!isValidOptionalDni(form.dni?.trim() ?? '')) {
      setError(DNI_ERROR);
      return;
    }
    if (!isValidOptionalPhone(form.phone?.trim() ?? '')) {
      setError(PHONE_ERROR);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const person = await createPerson({
        ...form,
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        dni: form.dni?.trim() || undefined,
        phone: form.phone?.trim() || undefined,
        code: form.code?.trim() || undefined,
        company: form.company?.trim() || undefined,
      });
      onCreated(`${person.name} quedó creado como ${ROLE_LABEL_REAL[person.role as CreatePersonInput['role']] ?? person.role} (cuenta real).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la cuenta.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="bg-surface rounded-lg shadow-xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h3 className="text-base font-semibold text-t1">{title}</h3>
          <button onClick={onClose} aria-label="Cerrar"><X size={17} /></button>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="p-3 bg-danger/5 border border-danger/30 rounded-lg text-sm text-danger">{error}</div>}
          <Field label="Nombre completo" required><input className={inputClass} value={form.name} onChange={e => set('name', e.target.value)} /></Field>
          <Field label="Correo (Google)" required><input inputMode="email" className={inputClass} value={form.email} onChange={e => set('email', e.target.value)} /></Field>
          {!fixedRole && (
            <Field label="Rol" required>
              <select className={inputClass} value={form.role} onChange={e => set('role', e.target.value as CreatePersonInput['role'])}>
                <option value="SOCIO">Socio</option>
                <option value="CONDUCTOR">Conductor</option>
                <option value="ADMINISTRADOR">Administrador</option>
              </select>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Field label="DNI"><input className={inputClass} {...dniInputProps} value={form.dni} onChange={e => set('dni', sanitizeDni(e.target.value))} /></Field>
            <Field label="Teléfono"><input className={inputClass} {...phoneInputProps} value={form.phone} onChange={e => set('phone', sanitizePhone(e.target.value))} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Código de unidad"><input className={inputClass} value={form.code} onChange={e => set('code', e.target.value)} /></Field>
            <Field label="Empresa"><input className={inputClass} value={form.company} onChange={e => set('company', e.target.value)} /></Field>
          </div>
          <p className="text-[11px] text-t2">Queda en estado Pendiente hasta que la persona inicie sesión con ese correo (Google) por primera vez.</p>
        </div>
        <div className="px-6 py-4 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-t2 hover:bg-hover rounded-lg">Cancelar</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h disabled:opacity-50">
            {saving ? 'Creando…' : 'Crear cuenta'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PeoplePage() {
  const { org } = useAdminDemo();
  const { user } = useAuth();
  // Un Administrador real ya no puede invitar a otro administrador (13 sept
  // 2026, decidido con Jayde: eso queda exclusivo de Super Admin). Pero un
  // Super Admin "actuando como administrador" (acting-org.ts) sigue viendo
  // este mismo PeoplePage -- para el, el boton debe seguir disponible.
  const isSuperAdmin = user?.role === 'superadmin';
  const [tab, setTab] = useState<PersonTab>('conductores');
  const [search, setSearch] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [showSuspended, setShowSuspended] = useState(false);
  const [licenseFilter, setLicenseFilter] = useState('');
  const [selected, setSelected] = useState<Person | null>(null);
  const [linking, setLinking] = useState<Person | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [showSocioRegistration, setShowSocioRegistration] = useState(false);
  const [showDriverRegistration, setShowDriverRegistration] = useState(false);
  const [version, setVersion] = useState(0);
  const [toast, setToast] = useState('');
  const [people, setPeople] = useState<Person[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchPeople(), fetchVehicles(), fetchCompanies()])
      .then(([peopleList, unitsList, companiesList]) => {
        if (cancelled) return;
        setPeople(peopleList);
        setUnits(unitsList);
        setCompanies(companiesList);
        setLoadError('');
      })
      .catch(err => { if (!cancelled) setLoadError(err instanceof Error ? err.message : 'No se pudieron cargar las personas.'); });
    return () => { cancelled = true; };
  }, [version]);

  const refresh = (message?: string) => {
    setVersion(v => v + 1);
    if (message) showToast(message);
  };

  const roleMap: Record<PersonTab, Person['role'] | null> = {
    conductores: 'CONDUCTOR', socios: 'SOCIO', administradores: 'ADMINISTRADOR', pendientes: null,
  };

  const filteredPeople = useMemo(() => people.filter(p => tab === 'pendientes' ? p.status === 'PENDIENTE' : p.role === roleMap[tab] && p.status !== 'PENDIENTE').filter(p => {
    const q = search.toLowerCase();
    return (!q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q) || p.code?.includes(q)) && (!filterCompany || p.company === filterCompany) && (showSuspended || p.status !== 'SUSPENDIDO') && (tab !== 'conductores' || !licenseFilter || licenseMatches(p, licenseFilter));
  }), [people, tab, search, filterCompany, showSuspended, licenseFilter]);

  const counts = {
    conductores: people.filter(p => p.role === 'CONDUCTOR' && p.status !== 'PENDIENTE').length,
    socios: people.filter(p => p.role === 'SOCIO' && p.status !== 'PENDIENTE').length,
    administradores: people.filter(p => p.role === 'ADMINISTRADOR' && p.status !== 'PENDIENTE').length,
    pendientes: people.filter(p => p.status === 'PENDIENTE').length,
  };
  const tabs: { id: PersonTab; label: string }[] = [{ id: 'conductores', label: 'Conductores' }, { id: 'socios', label: 'Socios' }, { id: 'administradores', label: 'Administradores' }, { id: 'pendientes', label: 'Pendientes' }];

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(''), 3500);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-border bg-surface flex items-center justify-between gap-4">
        <div><h1 className="text-2xl font-bold text-t1">Personas</h1><p className="text-sm text-t2 mt-0.5">{org?.name ?? 'Tu asociación'} · {counts.socios} socios · {counts.conductores} conductores · {people.length} registros</p></div>
        <div className="flex items-center gap-2">
          {tab === 'conductores' && <button onClick={() => setShowDriverRegistration(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h"><UserPlus size={15} /> Registrar conductor</button>}
          {tab === 'socios' && <button onClick={() => setShowSocioRegistration(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-h"><UserPlus size={15} /> Registrar socio</button>}
          {tab === 'administradores' && isSuperAdmin && <button onClick={() => setShowInvite(true)} className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm text-t1 hover:bg-hover"><UserPlus size={15} /> Invitar administrador auxiliar</button>}
        </div>
      </div>

      {toast && <div className="mx-6 mt-3 p-3 bg-ok/5 border border-ok/30 rounded-lg text-sm text-ok flex items-center gap-2"><CheckCircle size={14} />{toast}</div>}
      {loadError && <div className="mx-6 mt-3 p-3 bg-danger/5 border border-danger/30 rounded-lg text-sm text-danger">{loadError}</div>}
      {tab === 'administradores' && !isSuperAdmin && <div className="mx-6 mt-3 p-3 bg-bg border border-border rounded-lg text-sm text-t2">Para registrar a otro administrador, comunícate con CHASKI AI — el alta de cuentas de administrador es exclusiva de Super Admin.</div>}

      <div className="border-b border-border bg-surface"><div className="flex px-6">{tabs.map(t => <button key={t.id} onClick={() => { setTab(t.id); setSelected(null); }} className={`px-4 py-3 text-sm font-medium border-b-2 ${tab === t.id ? 'border-primary text-primary' : 'border-transparent text-t2 hover:text-t1'}`}>{t.label}<span className="ml-2 text-sm text-muted">({counts[t.id]})</span></button>)}</div></div>

      <div className="px-4 md:px-6 py-3 border-b border-border bg-surface flex flex-wrap items-center gap-3">
        <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Nombre, correo o código..." className="w-72 h-9 pl-9 pr-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" /></div>
        <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)} className="h-9 px-3 border border-border rounded-lg text-sm"><option value="">Todas las empresas</option>{companies.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}</select>
        <label className="flex items-center gap-2 text-sm text-t2 select-none"><input type="checkbox" checked={showSuspended} onChange={e => setShowSuspended(e.target.checked)} /> Mostrar dados de baja</label>
        {tab === 'conductores' && (
          <select value={licenseFilter} onChange={e => setLicenseFilter(e.target.value)} aria-label="Filtrar por licencia" className="h-9 px-3 border border-border rounded-lg text-sm">
            <option value="">Todas las licencias</option>
            <option value="alertas">Requieren atención</option>
            <option value="vencida">Vencidas</option>
            <option value="por_vencer">Por vencer (30 días)</option>
            <option value="sin_licencia">Sin licencia registrada</option>
          </select>
        )}
        <span className="text-sm text-t2 ml-auto">{filteredPeople.length} personas</span>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm" aria-label="Tabla de personas">
            <thead className="bg-bg sticky top-0"><tr className="text-left text-t2 border-b border-border"><th className="px-4 py-2.5 font-medium">Nombre</th><th className="px-4 py-2.5 font-medium">DNI</th><th className="px-4 py-2.5 font-medium">Correo</th><th className="px-4 py-2.5 font-medium">Empresa</th><th className="px-4 py-2.5 font-medium">Código</th>{(tab === 'conductores' || tab === 'socios') && <th className="px-4 py-2.5 font-medium">Unidad</th>}{tab === 'conductores' && <th className="px-4 py-2.5 font-medium">Licencia</th>}<th className="px-4 py-2.5 font-medium">Estado</th><th /></tr></thead>
            <tbody>{filteredPeople.map(person => <tr key={person.id} onClick={() => setSelected(person)} className="border-b border-border hover:bg-hover cursor-pointer"><td className="px-4 py-3 font-medium text-t1">{person.name}</td><td className="px-4 py-3 font-mono text-t2">{maskDni(person.dni)}</td><td className="px-4 py-3 text-t2">{person.email}</td><td className="px-4 py-3 text-t2">{person.company ?? org?.name ?? 'Sin dato'}</td><td className="px-4 py-3 font-mono font-semibold">{person.code ?? '—'}</td>{(tab === 'conductores' || tab === 'socios') && <td className="px-4 py-3 text-t2">{person.linkedUnit || person.code || 'Sin vincular'}</td>}{tab === 'conductores' && <td className="px-4 py-3"><LicenseBadge expiry={person.licenseExpiry} /></td>}<td className="px-4 py-3"><span className={`text-[11px] px-2 py-0.5 rounded font-medium ${STATUS_STYLE[person.status]}`}>{person.status}</span></td><td className="px-4 py-3"><ChevronRight size={14} className="text-muted" /></td></tr>)}</tbody>
          </table>
          {filteredPeople.length === 0 && !loadError && <div className="py-16 text-center text-sm text-t2">No hay registros para los filtros seleccionados.</div>}
        </div>
        {selected && (
          <PersonDetail
            person={selected}
            onClose={() => setSelected(null)}
            onLink={() => setLinking(selected)}
            onStatusChanged={(message) => { setSelected(null); refresh(message); }}
          />
        )}
      </div>

      {showSocioRegistration && (
        <RegisterSocioModal
          people={people}
          units={units}
          companies={companies}
          onClose={() => setShowSocioRegistration(false)}
          onCreated={(message) => { setShowSocioRegistration(false); setTab('socios'); refresh(message); }}
        />
      )}
      {showDriverRegistration && (
        <RegisterDriverModal
          people={people}
          units={units}
          onClose={() => setShowDriverRegistration(false)}
          onCreated={(message) => { setShowDriverRegistration(false); setTab('conductores'); refresh(message); }}
        />
      )}
      {showInvite && (
        <CreatePersonModal
          fixedRole="ADMINISTRADOR"
          title="Invitar administrador auxiliar"
          onClose={() => setShowInvite(false)}
          onCreated={(message) => { setShowInvite(false); refresh(message); }}
        />
      )}
      {linking && <LinkUnitModal person={linking} units={units} onClose={() => setLinking(null)} onSaved={(message) => { setLinking(null); setSelected(null); refresh(message); }} />}
    </div>
  );
}
