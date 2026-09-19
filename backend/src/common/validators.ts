import { applyDecorators } from '@nestjs/common';
import { Matches, ValidateIf } from 'class-validator';

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
