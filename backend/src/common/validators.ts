import { applyDecorators } from '@nestjs/common';
import { Matches, ValidateIf, registerDecorator, type ValidationArguments, type ValidationOptions } from 'class-validator';

// Reglas globales de identidad (Jayde, 19 sept 2026): DNI = exactamente 8
// digitos numericos; celular = exactamente 9 digitos numericos. Sin letras,
// espacios, guiones ni prefijo +51. Una sola definicion para todos los DTO.
export const DNI_REGEX = /^\d{8}$/;
export const PHONE_REGEX = /^\d{9}$/;

export const DNI_MESSAGE = 'El DNI debe tener exactamente 8 dígitos numéricos';
export const PHONE_MESSAGE = 'El celular debe tener exactamente 9 dígitos numéricos';

// Placa (Jayde, 19 sept 2026): 3 caracteres (letras o numeros, en mayuscula),
// guion y 3 numeros -- ej. Z0A-001. El guion lo pone solo la pantalla.
export const PLATE_REGEX = /^[A-Z0-9]{3}-\d{3}$/;
export const PLATE_MESSAGE = 'La placa debe tener 3 letras o números, un guion y 3 números (ej. Z0A-001)';
export const IsPlate = () => Matches(PLATE_REGEX, { message: PLATE_MESSAGE });

// Licencia de conducir (Jayde, 19 sept 2026): 9 caracteres -- 1 letra
// (A-Z) seguida de 8 numeros, ej. Q12345678. Sin guiones ni espacios.
export const LICENSE_REGEX = /^[A-Z]\d{8}$/;
export const LICENSE_MESSAGE = 'La licencia debe tener 9 caracteres: 1 letra seguida de 8 números (ej. Q12345678)';
export const IsLicense = () => Matches(LICENSE_REGEX, { message: LICENSE_MESSAGE });

// Campo obligatorio: si viene, debe cumplir la regla (y si falta, falla).
export const IsDni = () => Matches(DNI_REGEX, { message: DNI_MESSAGE });
export const IsPhone = () => Matches(PHONE_REGEX, { message: PHONE_MESSAGE });

// Campo opcional: ausente, null o vacio se acepta; si trae valor, debe cumplir.
export const IsOptionalDni = () =>
  applyDecorators(ValidateIf((_o, v) => v !== undefined && v !== null && v !== ''), IsDni());
export const IsOptionalPhone = () =>
  applyDecorators(ValidateIf((_o, v) => v !== undefined && v !== null && v !== ''), IsPhone());
export const IsOptionalLicense = () =>
  applyDecorators(ValidateIf((_o, v) => v !== undefined && v !== null && v !== ''), IsLicense());

// ─── RUC (Jayde, 19 sept 2026) ───────────────────────────────────────────────
// 11 numeros que empiezan con 10, 15, 16, 17 o 20, y el ultimo es un digito
// verificador (modulo 11 sobre los 10 primeros). Sin letras ni espacios.
export const RUC_REGEX = /^(10|15|16|17|20)\d{9}$/;
export const RUC_FORMAT_MESSAGE = 'El RUC debe tener exactamente 11 números y empezar con 10, 15, 16, 17 o 20';
export const RUC_CHECK_MESSAGE = 'El RUC no es válido: el dígito verificador no coincide';

export function hasValidRucCheckDigit(ruc: string): boolean {
  if (!/^\d{11}$/.test(ruc)) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((acc, w, i) => acc + w * Number(ruc[i]), 0);
  const remainder = 11 - (sum % 11);
  const check = remainder === 10 ? 0 : remainder === 11 ? 1 : remainder;
  return check === Number(ruc[10]);
}
export const isValidRuc = (ruc: string) => RUC_REGEX.test(ruc) && hasValidRucCheckDigit(ruc);

// Solo el formato (para EDITAR: un RUC ya guardado, aunque sea de prueba, no
// debe impedir guardar otros datos; el digito verificador se revisa en el
// servicio unicamente cuando el RUC cambia de verdad).
export const IsRucFormat = () => Matches(RUC_REGEX, { message: RUC_FORMAT_MESSAGE });
export const IsRuc = (options?: ValidationOptions) => (object: object, propertyName: string) =>
  registerDecorator({
    name: 'isRuc',
    target: object.constructor,
    propertyName,
    options,
    validator: {
      validate: (value: unknown) => typeof value === 'string' && isValidRuc(value),
      defaultMessage: (args?: ValidationArguments) =>
        typeof args?.value === 'string' && RUC_REGEX.test(args.value) ? RUC_CHECK_MESSAGE : RUC_FORMAT_MESSAGE,
    },
  });
const skipEmpty = () => ValidateIf((_o, v) => v !== undefined && v !== null && v !== '');
export const IsOptionalRuc = () => applyDecorators(skipEmpty(), IsRuc());
export const IsOptionalRucFormat = () => applyDecorators(skipEmpty(), IsRucFormat());

// ─── Tipo y numero de documento (pasajeros, Libro de Reclamaciones) ─────────
export const DOCUMENT_TYPES = ['DNI', 'CE', 'PASAPORTE'] as const;
export const COMPLAINT_DOCUMENT_TYPES = ['DNI', 'CE', 'PASAPORTE', 'RUC'] as const;
export type DocumentType = (typeof COMPLAINT_DOCUMENT_TYPES)[number];

const DOCUMENT_RULES: Record<DocumentType, { test: (v: string) => boolean; message: string }> = {
  DNI: { test: (v) => DNI_REGEX.test(v), message: DNI_MESSAGE },
  // Formatos de CE y pasaporte: supuesto acordado con Jayde (a confirmar).
  CE: { test: (v) => /^[A-Z0-9]{9,12}$/.test(v), message: 'El carné de extranjería debe tener de 9 a 12 letras o números' },
  PASAPORTE: { test: (v) => /^[A-Z0-9]{6,12}$/.test(v), message: 'El pasaporte debe tener de 6 a 12 letras o números' },
  RUC: { test: (v) => isValidRuc(v), message: 'El RUC debe tener 11 números y ser válido (empezar con 10, 15, 16, 17 o 20 y tener un dígito verificador correcto)' },
};

export const isValidDocument = (type: string | undefined, value: string): boolean => {
  const rule = DOCUMENT_RULES[(type ?? 'DNI') as DocumentType];
  return Boolean(rule) && rule.test(value);
};

// ─── Documento de identidad de personas (admin/socio/conductor) ─────────────
// A diferencia de pasajeros/reclamos, aqui solo aplican DNI y Carne de
// Extranjeria -- un pasaporte no habilita a conducir en Peru (MTC exige DNI o
// CE para emitir licencia), asi que no se ofrece como opcion para el personal.
export const PERSON_DOCUMENT_TYPES = ['DNI', 'CE'] as const;
export type PersonDocumentType = (typeof PERSON_DOCUMENT_TYPES)[number];

// Valida el numero segun el tipo que viene en el mismo cuerpo (por defecto DNI).
export const IsDocumentNumber = (typeField = 'documentType', options?: ValidationOptions) => (object: object, propertyName: string) =>
  registerDecorator({
    name: 'isDocumentNumber',
    target: object.constructor,
    propertyName,
    options,
    constraints: [typeField],
    validator: {
      validate: (value: unknown, args?: ValidationArguments) => {
        const type = (args?.object as Record<string, unknown>)?.[typeField] as string | undefined;
        return typeof value === 'string' && isValidDocument(type, value);
      },
      defaultMessage: (args?: ValidationArguments) => {
        const type = ((args?.object as Record<string, unknown>)?.[typeField] as DocumentType | undefined) ?? 'DNI';
        return DOCUMENT_RULES[type]?.message ?? DNI_MESSAGE;
      },
    },
  });

// Campo opcional que valida contra el tipo de documento del mismo objeto
// (por defecto DNI si no se especifica) -- igual que IsOptionalDni pero
// tambien acepta CE cuando documentType = 'CE'.
export const IsOptionalDocumentNumber = (typeField = 'documentType') =>
  applyDecorators(skipEmpty(), IsDocumentNumber(typeField));

// ─── Categoria de licencia de conducir ──────────────────────────────────────
// Categorias profesionales del MTC que aplican a transporte de personas
// (Sprinter/Hiace/Master, ruta interprovincial) -- supuesto acordado con
// Jayde (a confirmar): se listan las 3 categorias A-III (transporte de
// personas y mercancias); A-I/A-IIa/A-IIb son de vehiculos particulares y no
// habilitan a conducir una unidad de la asociacion.
export const LICENSE_CATEGORIES = ['A-IIIa', 'A-IIIb', 'A-IIIc'] as const;
export type LicenseCategory = (typeof LICENSE_CATEGORIES)[number];
export const LICENSE_CATEGORY_MESSAGE = `La categoría debe ser una de: ${LICENSE_CATEGORIES.join(', ')}`;

// ─── Contraseña ─────────────────────────────────────────────────────────────
// 8 a 72 caracteres (72 es el limite real de bcrypt), con al menos una letra y
// un numero, y que no sea de las mas comunes.
export const PASSWORD_MESSAGE = 'La contraseña debe tener entre 8 y 72 caracteres, con al menos una letra y un número.';
export const PASSWORD_COMMON_MESSAGE = 'Esa contraseña es demasiado común. Elige otra.';
const COMMON_PASSWORDS = new Set([
  '12345678', '123456789', '1234567890', '11111111', '12341234', '87654321', 'password', 'password1', 'password12',
  'password123', 'contraseña1', 'contrasena1', 'contraseña123', 'qwerty123', 'qwertyuiop', 'abc12345', 'a1234567',
  'admin123', 'admin1234', 'chaski123', 'chaskiai1', 'iloveyou1', 'peru12345', 'bienvenido1', 'test1234',
]);
export const passwordProblem = (value: string): string | null => {
  if (value.length < 8 || value.length > 72 || !/[A-Za-z]/.test(value) || !/\d/.test(value)) return PASSWORD_MESSAGE;
  if (COMMON_PASSWORDS.has(value.toLowerCase())) return PASSWORD_COMMON_MESSAGE;
  return null;
};
export const IsSecurePassword = (options?: ValidationOptions) => (object: object, propertyName: string) =>
  registerDecorator({
    name: 'isSecurePassword',
    target: object.constructor,
    propertyName,
    options,
    validator: {
      validate: (value: unknown) => typeof value === 'string' && passwordProblem(value) === null,
      defaultMessage: (args?: ValidationArguments) =>
        (typeof args?.value === 'string' ? passwordProblem(args.value) : null) ?? PASSWORD_MESSAGE,
    },
  });

// ─── IMEI del equipo GPS y año de la unidad ─────────────────────────────────
export const IMEI_REGEX = /^\d{15}$/;
export const IMEI_MESSAGE = 'El IMEI debe tener exactamente 15 números';
// Vacio = desvincular el equipo; si trae valor, debe ser un IMEI de 15 numeros.
export const IsOptionalImei = () => applyDecorators(skipEmpty(), Matches(IMEI_REGEX, { message: IMEI_MESSAGE }));

export const VEHICLE_YEAR_MIN = 1990;
export const vehicleYearMax = () => new Date().getFullYear() + 1;
export const VEHICLE_YEAR_MESSAGE = () => `El año debe tener 4 números, entre ${VEHICLE_YEAR_MIN} y ${vehicleYearMax()}`;
export const IsVehicleYear = (options?: ValidationOptions) => (object: object, propertyName: string) =>
  registerDecorator({
    name: 'isVehicleYear',
    target: object.constructor,
    propertyName,
    options,
    validator: {
      validate: (value: unknown) => Number.isInteger(value) && (value as number) >= VEHICLE_YEAR_MIN && (value as number) <= vehicleYearMax(),
      defaultMessage: () => VEHICLE_YEAR_MESSAGE(),
    },
  });

// ─── Licencia: fechas ───────────────────────────────────────────────────────
// La emision no puede ser futura y el vencimiento tiene que ser posterior a la emision.
export function licenseDatesProblem(issuedAt: Date, expiry: Date): string | null {
  const today = new Date();
  today.setUTCHours(23, 59, 59, 999);
  if (issuedAt.getTime() > today.getTime()) return 'La fecha de emisión de la licencia no puede ser futura.';
  if (expiry.getTime() <= issuedAt.getTime()) return 'El vencimiento de la licencia debe ser posterior a su fecha de emisión.';
  return null;
}
