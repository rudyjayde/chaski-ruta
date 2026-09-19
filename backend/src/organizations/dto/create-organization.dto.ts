import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { IsOptionalPhone } from '../../common/validators';

// Corresponde al Paso 1 del wizard "Nueva asociacion" del Super Admin
// (ver SuperAdminApp.tsx WIZARD_STEPS en el frontend).
export class CreateOrganizationDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @MinLength(11)
  ruc: string;

  @IsEmail()
  adminEmail: string;

  @IsString()
  @MinLength(2)
  adminName: string;

  @IsOptional()
  @IsIn(['OPERACION', 'PRO'])
  plan?: 'OPERACION' | 'PRO';

  @IsOptional()
  @IsBoolean()
  driverLiveMapEnabled?: boolean;

  // Datos institucionales del paso 0 del wizard -- antes se pedian y nunca se
  // guardaban (el DTO no los tenia). Ver comentario en schema.prisma.
  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  legalRepName?: string;

  @IsOptionalPhone()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  // Paso 2 del wizard: nombre del corredor propio de esta asociacion (nunca
  // compartido con otras). Opcionales — si no se envian, la asociacion queda
  // con los defaults del schema (Juli/Puno) hasta que se configuren.
  // Logo (imagen como data URI o URL) capturado en el paso 0 del wizard.
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  terminalOriginName?: string;

  @IsOptional()
  @IsString()
  terminalOriginAddress?: string;

  @IsOptional()
  @IsString()
  terminalDestinationName?: string;

  @IsOptional()
  @IsString()
  terminalDestinationAddress?: string;
}
