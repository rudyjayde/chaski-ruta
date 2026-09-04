import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class CreatePersonDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsEmail()
  email: string;

  @IsIn(['ADMINISTRADOR', 'SOCIO', 'CONDUCTOR'])
  // SUPERADMIN nunca se crea desde aqui — es exclusivo de CHASKI AI (seed.ts).
  role: 'ADMINISTRADOR' | 'SOCIO' | 'CONDUCTOR';

  @IsOptional()
  @IsString()
  dni?: string;

  @IsOptional()
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
}
