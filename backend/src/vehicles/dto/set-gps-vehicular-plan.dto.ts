import { IsBoolean, IsISO8601, IsOptional, IsString, MinLength } from 'class-validator';

// Prender/apagar el Plan GPS Vehicular individual de una unidad -- Super
// Admin lo usa cuando el socio paga (activo=true) o deja de pagar
// (activo=false) el servicio individual, sin tocar el traccarDeviceId (el
// hecho tecnico de que el equipo esta instalado nunca se pierde por esto).
export class SetGpsVehicularPlanDto {
  @IsBoolean()
  activo: boolean;

  // Motivo obligatorio -- mismo criterio que cualquier otra excepcion del
  // sistema (ej. cambio de plan de la asociacion): sin modulo de pagos
  // interno, esta auditoria es el unico rastro real de por que se corto o
  // reactivo el servicio de un socio puntual.
  @IsString()
  @MinLength(3)
  reason: string;

  // Fecha de referencia (ej. fin de los 10 dias de gracia) -- PURAMENTE
  // informativa para que Super Admin sepa a quien le toca revisar. Nada la
  // lee automaticamente. null la limpia.
  @IsOptional()
  @IsISO8601()
  venceEn?: string | null;
}
