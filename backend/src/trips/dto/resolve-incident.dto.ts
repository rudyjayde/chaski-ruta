import { IsIn, IsString, MinLength, MaxLength } from 'class-validator';

export class ResolveIncidentDto {
  @IsIn(['ACTIVO', 'COMPLETADO'])
  resolution: 'ACTIVO' | 'COMPLETADO';

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}
