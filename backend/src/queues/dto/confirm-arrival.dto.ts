import { IsLatitude, IsLongitude } from 'class-validator';

// Chequeo puntual (una sola vez) de la posicion del celular al confirmar
// llegada — NUNCA rastreo continuo (plan-operacion.md §3.3).
export class ConfirmArrivalDto {
  @IsLatitude()
  lat: number;

  @IsLongitude()
  lng: number;
}
