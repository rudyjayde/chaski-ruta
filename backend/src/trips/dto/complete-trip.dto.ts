import { IsLatitude, IsLongitude, IsOptional, IsString } from 'class-validator';

export class CompleteTripDto {
  @IsOptional()
  @IsString()
  arrivalTime?: string;

  // "Marcar llegada" en Plan Operacion (plan-flujo-colas-hardware.md §2.6):
  // posicion del celular del conductor, un chequeo puntual -- igual que
  // ConfirmArrivalDto en colas. No se pide en Plan PRO con hardware
  // vinculado (ahi se lee la posicion real del vehiculo via Traccar).
  @IsOptional()
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @IsLongitude()
  lng?: number;
}
