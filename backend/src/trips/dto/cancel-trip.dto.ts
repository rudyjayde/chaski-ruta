import { IsString, MinLength } from 'class-validator';

// "Anular viaje" (admin/superadmin) -- para un viaje PROGRAMADO que quedo
// atascado (el conductor preparo/cerro el manifiesto pero nunca marco
// salida, o se equivoco de ruta/unidad). Siempre con motivo obligatorio y
// registro de auditoria, igual que las demas excepciones manuales (§3.6).
// Solo aplica a PROGRAMADO -- un viaje ACTIVO se resuelve con "Marcar
// llegada" o con la alerta de incidencia, nunca anulandolo.
export class CancelTripDto {
  @IsString()
  @MinLength(3)
  reason: string;
}
