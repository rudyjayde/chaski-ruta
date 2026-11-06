import { IsInt, IsOptional, IsString, Min, Max } from 'class-validator';

export class OpenManifestDto {
  @IsString()
  tripId: string;

  // Ignorado: la capacidad sale del tipo de vehiculo (manifests.service.ts#open).
  // Se sigue aceptando porque la app nativa todavia la manda.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  capacity?: number;
}
