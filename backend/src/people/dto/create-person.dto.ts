import { IsDateString, IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { IsOptionalDni, IsOptionalLicense, IsOptionalPhone } from '../../common/validators';

export class CreatePersonDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsEmail()
  email: string;

  @IsIn(['ADMINISTRADOR', 'SOCIO', 'CONDUCTOR'])
  // SUPERADMIN nunca se crea desde aqui — es exclusivo de CHASKI AI (seed.ts).
  role: 'ADMINISTRADOR' | 'SOCIO' | 'CONDUCTOR';

  @IsOptionalDni()
  @IsString()
  dni?: string;

  @IsOptionalPhone()
  @IsString()
  phone?: string;

  // Codigo de unidad, cuando aplica (conductor/socio) — para que el conductor
  // encuentre "su" vehiculo (user.code) y el socio sus reportes.
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  company?: string;

  // Licencia de conducir -- solo para role CONDUCTOR (ver PeopleService.create).
  @IsOptionalLicense()
  @IsString()
  license?: string;

  @IsOptional()
  @IsString()
  licenseCategory?: string;

  // Fecha de vencimiento, "AAAA-MM-DD".
  @IsOptional()
  @IsDateString()
  licenseExpiry?: string;
}
