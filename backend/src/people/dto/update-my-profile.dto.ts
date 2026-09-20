import { IsDateString, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import {
  IsOptionalDocumentNumber,
  IsOptionalLicense,
  IsOptionalPhone,
  LICENSE_CATEGORIES,
  PERSON_DOCUMENT_TYPES,
} from '../../common/validators';

// "Mi cuenta": lo que una persona puede corregir de SI MISMA. El correo, el rol
// y la asociacion no estan aqui a proposito -- con forbidNonWhitelisted, mandar
// cualquiera de ellos responde 400. DNI y celular vacios significan "no cambiar";
// el nombre nunca puede quedar vacio.
export class UpdateMyProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsIn(PERSON_DOCUMENT_TYPES, { message: `El tipo de documento debe ser: ${PERSON_DOCUMENT_TYPES.join(' o ')}` })
  documentType?: 'DNI' | 'CE';

  @IsOptionalDocumentNumber()
  @IsString()
  dni?: string;

  @IsOptionalPhone()
  @IsString()
  phone?: string;

  // Solo conductores (ver PeopleService.updateMe).
  @IsOptionalLicense()
  @IsString()
  license?: string;

  @IsOptional()
  @IsIn(LICENSE_CATEGORIES, { message: `La categoría debe ser una de: ${LICENSE_CATEGORIES.join(', ')}` })
  licenseCategory?: string;

  @IsOptional()
  @IsDateString({}, { message: 'La fecha de emisión de la licencia no es válida' })
  licenseIssuedAt?: string;

  @IsOptional()
  @IsDateString({}, { message: 'La fecha de vencimiento de la licencia no es válida' })
  licenseExpiry?: string;
}
