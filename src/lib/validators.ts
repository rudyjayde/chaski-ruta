// Reglas globales de identidad (Jayde, 19 sept 2026): DNI = exactamente 8
// digitos numericos; celular = exactamente 9 digitos numericos. Sin letras,
// espacios, guiones ni prefijo +51. Misma regla que backend/src/common/
// validators.ts -- si una cambia, cambia la otra.
export const DNI_LENGTH = 8;
export const PHONE_LENGTH = 9;

export const DNI_ERROR = 'El DNI debe tener exactamente 8 dígitos numéricos.';
export const PHONE_ERROR = 'El celular debe tener exactamente 9 dígitos numéricos.';

// Para el onChange del campo: descarta letras y todo lo que pase del largo.
export const sanitizeDni = (value: string) => value.replace(/\D/g, '').slice(0, DNI_LENGTH);

// Al pegar un numero con prefijo de pais ("+51 987 654 321") se quita el 51 en
// vez de cortar mal los primeros 9 digitos. Tipeando, nunca pasa de 9 digitos.
export const sanitizePhone = (value: string) => {
  let digits = value.replace(/\D/g, '');
  if (digits.length > PHONE_LENGTH && digits.startsWith('51')) digits = digits.slice(2);
  return digits.slice(0, PHONE_LENGTH);
};

export const isValidDni = (value: string) => /^\d{8}$/.test(value);
export const isValidPhone = (value: string) => /^\d{9}$/.test(value);

// Licencia de conducir (Jayde, 19 sept 2026): 9 caracteres -- 1 letra (A-Z)
// seguida de 8 numeros, ej. Q12345678. Mismo formato que el backend.
export const LICENSE_ERROR = 'La licencia debe tener 9 caracteres: 1 letra seguida de 8 números (ej. Q12345678).';
export const isValidLicense = (value: string) => /^[A-Z]\d{8}$/.test(value);

// Para el onChange: mayusculas; el primer caracter tiene que ser una letra
// (los numeros del principio se descartan) y despues solo entran 8 numeros.
export const sanitizeLicense = (value: string) => {
  const raw = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const letter = raw.match(/[A-Z]/);
  if (!letter) return '';
  const digits = raw.slice(raw.indexOf(letter[0]) + 1).replace(/\D/g, '').slice(0, 8);
  return letter[0] + digits;
};

// "Q12345678" -> "Q******78" (mismo criterio que el DNI enmascarado en Personas).
export const maskLicense = (value?: string | null) => (value ? `${value[0]}${'*'.repeat(6)}${value.slice(-2)}` : '');

// El vencimiento es una fecha sin hora: se muestra en UTC para que no
// retroceda un dia por la zona horaria de Peru (UTC-5).
export const formatLicenseExpiry = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
export const licenseExpiryInputValue = (value?: string | null) => (value ? value.slice(0, 10) : '');

// Placa (Jayde, 19 sept 2026): 3 caracteres (letras o numeros) + guion + 3
// numeros, ej. Z0A-001. Mismo formato que backend/src/common/validators.ts.
export const PLATE_ERROR = 'La placa debe tener 3 letras o números, un guion y 3 números (ej. Z0A-001).';
export const isValidPlate = (value: string) => /^[A-Z0-9]{3}-\d{3}$/.test(value);

// Para el onChange: mayusculas, sin simbolos; al completar los 3 primeros
// caracteres aparece el guion solo, y despues solo entran numeros. `previous`
// es el valor anterior del campo: si el usuario esta borrando, el guion no se
// vuelve a poner (si no, nunca se podria borrar hacia atras).
export const sanitizePlate = (value: string, previous = '') => {
  const chars = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const head = chars.slice(0, 3);
  const tail = chars.slice(3).replace(/\D/g, '').slice(0, 3);
  if (head.length < 3) return head;
  if (tail === '' && value.length < previous.length) return head;
  return `${head}-${tail}`;
};

// Año del vehiculo: exactamente 4 numeros, entre 1990 y el año que viene.
export const YEAR_MIN = 1990;
export const yearMax = () => new Date().getFullYear() + 1;
export const YEAR_ERROR = () => `El año debe tener 4 números, entre ${YEAR_MIN} y ${yearMax()}.`;
export const sanitizeYear = (value: string) => value.replace(/\D/g, '').slice(0, 4);
export const isValidYear = (value: string) => /^\d{4}$/.test(value) && Number(value) >= YEAR_MIN && Number(value) <= yearMax();

// Campos opcionales: vacio esta bien, pero si se escribio algo debe cumplir.
export const isValidOptionalDni = (value: string) => value === '' || isValidDni(value);
export const isValidOptionalPhone = (value: string) => value === '' || isValidPhone(value);

// Atributos del <input> para que el celular muestre teclado numerico. Sin
// maxLength a proposito: el navegador cortaria un pegado con "+51" antes de
// que sanitizePhone pueda quitarle el prefijo; el largo lo garantiza el
// sanitize del onChange (el valor del campo nunca pasa del maximo).
export const dniInputProps = { inputMode: 'numeric' as const, autoComplete: 'off' };
export const phoneInputProps = { inputMode: 'numeric' as const, autoComplete: 'tel' };

// ─── RUC (Jayde, 19 sept 2026) ───────────────────────────────────────────────
// 11 numeros que empiezan con 10, 15, 16, 17 o 20; el ultimo es un digito
// verificador (modulo 11). Misma regla que backend/src/common/validators.ts.
export const RUC_ERROR = 'El RUC debe tener 11 números, empezar con 10, 15, 16, 17 o 20 y ser válido (dígito verificador).';
export const sanitizeRuc = (value: string) => value.replace(/\D/g, '').slice(0, 11);
export const isValidRuc = (value: string) => {
  if (!/^(10|15|16|17|20)\d{9}$/.test(value)) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((acc, w, i) => acc + w * Number(value[i]), 0);
  const remainder = 11 - (sum % 11);
  const check = remainder === 10 ? 0 : remainder === 11 ? 1 : remainder;
  return check === Number(value[10]);
};
export const isValidOptionalRuc = (value: string) => value === '' || isValidRuc(value);
export const rucInputProps = { inputMode: 'numeric' as const, autoComplete: 'off' };

// ─── Contraseña ─────────────────────────────────────────────────────────────
export const PASSWORD_HINT = 'Mínimo 8 caracteres, con al menos una letra y un número.';
const COMMON_PASSWORDS = new Set([
  '12345678', '123456789', '1234567890', '11111111', '12341234', '87654321', 'password', 'password1', 'password12',
  'password123', 'contraseña1', 'contrasena1', 'contraseña123', 'qwerty123', 'qwertyuiop', 'abc12345', 'a1234567',
  'admin123', 'admin1234', 'chaski123', 'chaskiai1', 'iloveyou1', 'peru12345', 'bienvenido1', 'test1234',
]);
// null = la contraseña sirve; si no, el motivo en español.
export const passwordProblem = (value: string): string | null => {
  if (value.length < 8 || value.length > 72 || !/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    return 'La contraseña debe tener entre 8 y 72 caracteres, con al menos una letra y un número.';
  }
  if (COMMON_PASSWORDS.has(value.toLowerCase())) return 'Esa contraseña es demasiado común. Elige otra.';
  return null;
};

// ─── Tipo y numero de documento (pasajeros, Libro de Reclamaciones) ─────────
export type DocumentType = 'DNI' | 'CE' | 'PASAPORTE' | 'RUC';
export const PASSENGER_DOCUMENT_TYPES: { value: DocumentType; label: string }[] = [
  { value: 'DNI', label: 'DNI' },
  { value: 'CE', label: 'Carné de extranjería' },
  { value: 'PASAPORTE', label: 'Pasaporte' },
];
export const COMPLAINT_DOCUMENT_TYPES: { value: DocumentType; label: string }[] = [...PASSENGER_DOCUMENT_TYPES, { value: 'RUC', label: 'RUC' }];
export const documentLabel = (type?: string | null) => (type === 'CE' ? 'CE' : type === 'PASAPORTE' ? 'Pasaporte' : type === 'RUC' ? 'RUC' : 'DNI');

export const sanitizeDocument = (type: DocumentType, value: string) => {
  if (type === 'DNI') return sanitizeDni(value);
  if (type === 'RUC') return sanitizeRuc(value);
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
};
export const isValidDocument = (type: DocumentType, value: string) => {
  if (type === 'DNI') return isValidDni(value);
  if (type === 'RUC') return isValidRuc(value);
  if (type === 'CE') return /^[A-Z0-9]{9,12}$/.test(value);
  return /^[A-Z0-9]{6,12}$/.test(value);
};
export const documentError = (type: DocumentType) =>
  type === 'DNI' ? DNI_ERROR
    : type === 'RUC' ? RUC_ERROR
    : type === 'CE' ? 'El carné de extranjería debe tener de 9 a 12 letras o números.'
    : 'El pasaporte debe tener de 6 a 12 letras o números.';
export const documentPlaceholder = (type: DocumentType) =>
  type === 'DNI' ? '8 números' : type === 'RUC' ? '11 números' : type === 'CE' ? '9 a 12 letras o números' : '6 a 12 letras o números';

// ─── Tipo y numero de documento de personal (admin/socio/conductor) ─────────
// Solo DNI o Carne de Extranjeria -- un pasaporte no habilita a conducir en
// Peru, asi que no aplica al personal (a diferencia de un pasajero).
export type PersonDocumentType = 'DNI' | 'CE';
export const PERSON_DOCUMENT_TYPES: { value: PersonDocumentType; label: string }[] = [
  { value: 'DNI', label: 'DNI' },
  { value: 'CE', label: 'Carné de extranjería' },
];

// ─── Categoria de licencia de conducir ──────────────────────────────────────
// Categorias profesionales del MTC para transporte de personas (Sprinter/
// Hiace/Master) -- supuesto acordado con Jayde (a confirmar). Mismo catalogo
// que backend/src/common/validators.ts.
export const LICENSE_CATEGORIES = ['A-IIIa', 'A-IIIb', 'A-IIIc'] as const;
export const LICENSE_CATEGORY_ERROR = `La categoría debe ser una de: ${LICENSE_CATEGORIES.join(', ')}.`;

// ─── GPS: IMEI del equipo ───────────────────────────────────────────────────
export const IMEI_ERROR = 'El IMEI debe tener exactamente 15 números.';
export const sanitizeImei = (value: string) => value.replace(/\D/g, '').slice(0, 15);
export const isValidOptionalImei = (value: string) => value === '' || /^\d{15}$/.test(value);

// ─── Licencia: fechas y estado ──────────────────────────────────────────────
export const LICENSE_WARNING_DAYS = 30;
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
// '' = fechas coherentes; si no, el motivo. Formato YYYY-MM-DD.
export const licenseDatesError = (issued: string, expiry: string) => {
  if (!issued) return 'Indica la fecha de emisión de la licencia.';
  if (!expiry) return 'Indica la fecha de vencimiento de la licencia.';
  if (issued > todayStr()) return 'La fecha de emisión no puede ser futura.';
  if (expiry <= issued) return 'El vencimiento debe ser posterior a la fecha de emisión.';
  return '';
};
export type LicenseStatusKind = 'vigente' | 'por_vencer' | 'vencida' | 'sin_licencia';
export const licenseStatus = (expiry?: string | null): { kind: LicenseStatusKind; label: string; days: number | null; cls: string } => {
  if (!expiry) return { kind: 'sin_licencia', label: 'Sin licencia', days: null, cls: 'bg-warn/10 text-warn' };
  const days = Math.round((Date.parse(expiry.slice(0, 10)) - Date.parse(todayStr())) / 86400000);
  if (days < 0) return { kind: 'vencida', label: 'Vencida', days, cls: 'bg-danger/10 text-danger' };
  if (days <= LICENSE_WARNING_DAYS) return { kind: 'por_vencer', label: 'Por vencer', days, cls: 'bg-warn/10 text-warn' };
  return { kind: 'vigente', label: 'Vigente', days, cls: 'bg-ok/10 text-ok' };
};

// Para el atributo max de un <input type="date"> (nada de fechas futuras).
export const todayInputValue = () => todayStr();
