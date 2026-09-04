import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class JoinQueueDto {
  @IsString()
  vehicleId: string;

  // Huella del dispositivo del conductor (vinculo cuenta-dispositivo, §3.2).
  // La app/celular debe generar y reenviar siempre el mismo valor por instalacion.
  @IsOptional()
  @IsString()
  deviceId?: string;

  // Si viene de una orden de reubicacion, exime del gate de tiempo minimo de viaje (§3.4).
  @IsOptional()
  @IsBoolean()
  isRelocation?: boolean;
}
