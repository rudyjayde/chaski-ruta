import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateOrganizationDto {
  // Renovacion de directiva/marca (p. ej. la asociacion cambia de nombre
  // legal) -- solo Super Admin, con auditoria (antes/despues) igual que el
  // resto de campos de esta pantalla.
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  // RUC -- normalmente no cambia, pero se permite corregirlo (p. ej. un
  // error de tipeo al crear la asociacion). Es @unique en el modelo -- el
  // servicio atrapa el conflicto y devuelve un mensaje claro en vez de un 500.
  @IsOptional()
  @IsString()
  @MinLength(11)
  ruc?: string;

  // Datos institucionales -- ciudad, representante legal, telefono y correo
  // de contacto de la asociacion (no confundir con el correo del gerente,
  // que vive en Person y se gestiona desde Personas).
  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  legalRepName?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsBoolean()
  driverLiveMapEnabled?: boolean;

  // Solo Super Admin, desde el panel de la asociacion (no hay flujo de pago
  // real conectado todavia -- ver plan-pro.md). Desbloquea GPS Vehicular y
  // el Asistente AI para esa asociacion.
  @IsOptional()
  @IsIn(['OPERACION', 'PRO'])
  plan?: 'OPERACION' | 'PRO';

  @IsOptional()
  @IsIn(['ACTIVA', 'EN_CONFIGURACION', 'SUSPENDIDA'])
  status?: 'ACTIVA' | 'EN_CONFIGURACION' | 'SUSPENDIDA';

  @IsOptional()
  @IsString()
  logoUrl?: string;
}
