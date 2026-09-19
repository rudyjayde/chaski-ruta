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
