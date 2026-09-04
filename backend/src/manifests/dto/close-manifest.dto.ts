import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CloseManifestDto {
  @IsOptional()
  @IsString()
  arrivalTime?: string;

  // Obligatorio en true si se cierra sin pasajeros digitalizados (§3.8): confirma
  // que existe el respaldo fisico en papel que los pasajeros llenaron por turnos.
  @IsOptional()
  @IsBoolean()
  paperBackupConfirmed?: boolean;
}
