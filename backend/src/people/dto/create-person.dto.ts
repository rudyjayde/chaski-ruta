import { IsDateString, IsEmail, IsIn, IsOptional, IsString, MinLength, MaxLength } from 'class-validator';
import {
  IsOptionalDocumentNumber,
  IsOptionalLicense,
  IsOptionalPhone,
  LICENSE_CATEGORIES,
  PERSON_DOCUMENT_TYPES,
} from '../../common/validators';

export class CreatePersonDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsIn(['ADMINISTRADOR', 'SOCIO', 'CONDUCTOR'])
  // SUPERADMIN nunca se crea desde aqui — es exclusivo de CHASKI AI (seed.ts).
  role: 'ADMINISTRADOR' | 'SOCIO' | 'CONDUCTOR';

  // Tipo del documento que trae `dni` -- por defecto DNI si no se especifica.
  @IsOptional()
  @IsIn(PERSON_DOCUMENT_TYPES, { message: `El tipo de documento debe ser: ${PERSON_DOCUMENT_TYPES.join(' o ')}` })
  documentType?: 'DNI' | 'CE';

  @IsOptionalDocumentNumber()
  @IsString()
  dni?: string;

  @IsOptionalPhone()
  @IsString()
  phone?: string;

  // Codigo de unidad, cuando aplica (conductor/socio) — para que el conductor
  // encuentre "su" vehiculo (user.code) y el socio sus reportes.
  @IsOptional()
  @IsString()
  @MaxLength(10)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  company?: string;

  // Licencia de conducir -- solo para role CONDUCTOR (ver PeopleService.create).
  @IsOptionalLicense()
  @IsString()
  license?: string;

  @IsOptional()
  @IsIn(LICENSE_CATEGORIES, { message: `La categoría debe ser una de: ${LICENSE_CATEGORIES.join(', ')}` })
  licenseCategory?: string;

  // Fecha de vencimiento, "AAAA-MM-DD".
  @IsOptional()
  @IsDateString()
  licenseIssuedAt?: string;

  @IsOptional()
  @IsDateString()
  licenseExpiry?: string;
}
