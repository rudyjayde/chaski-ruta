import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength, MaxLength } from 'class-validator';
import { IsOptionalPhone, IsRucFormat } from '../../common/validators';

export class UpdateOrganizationDto {
  // Renovacion de directiva/marca (p. ej. la asociacion cambia de nombre
  // legal) -- solo Super Admin, con auditoria (antes/despues) igual que el
  // resto de campos de esta pantalla.
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name?: string;

  // RUC -- normalmente no cambia, pero se permite corregirlo (p. ej. un
  // error de tipeo al crear la asociacion). Es @unique en el modelo -- el
  // servicio atrapa el conflicto y devuelve un mensaje claro en vez de un 500.
  @IsOptional()
  @IsString()
  @IsRucFormat()
  ruc?: string;

  // Datos institucionales -- ciudad, representante legal, telefono y correo
  // de contacto de la asociacion (no confundir con el correo del gerente,
  // que vive en Person y se gestiona desde Personas).
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  legalRepName?: string;

  @IsOptionalPhone()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsBoolean()
  driverLiveMapEnabled?: boolean;

  // Solo Super Admin, desde el panel de la asociacion. El pago se coordina
  // por fuera de la plataforma (cotizacion desde la landing + acuerdo directo
  // con Jayde, decision 11 sept 2026 -- ya no habra un modulo de Pagos
  // interno) -- este es el UNICO interruptor real que activa/desactiva PRO.
  // Desbloquea GPS Vehicular y el Asistente AI para esa asociacion.
  @IsOptional()
  @IsIn(['OPERACION', 'PRO'])
  plan?: 'OPERACION' | 'PRO';

  // Obligatorio solo cuando `plan` de verdad cambia (lo exige el service, no
  // aqui, porque aqui no se sabe todavia cual es el plan actual) -- deja
  // registrado EN LA AUDITORIA por que se activo o desactivo PRO (ej. "pago
  // confirmado por transferencia, referencia 00123"), ya que no hay ningun
  // otro rastro de facturacion en el sistema.
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsIn(['ACTIVA', 'EN_CONFIGURACION', 'SUSPENDIDA'])
  status?: 'ACTIVA' | 'EN_CONFIGURACION' | 'SUSPENDIDA';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoUrl?: string;

  // Dias de gracia del Plan GPS Vehicular al bajar de PRO a Operacion (13
  // sept 2026, editable por Super Admin desde el tab "Plan GPS Vehicular") --
  // 10 es el acuerdo comercial por defecto, no un limite fijo del sistema.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  gpsVehicularGraceDays?: number;
}
