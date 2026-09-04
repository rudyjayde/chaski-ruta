import { IsIn, IsString, MinLength } from 'class-validator';

export class ResolveIncidentDto {
  @IsIn(['ACTIVO', 'COMPLETADO'])
  resolution: 'ACTIVO' | 'COMPLETADO';

  @IsString()
  @MinLength(3)
  reason: string;
}
