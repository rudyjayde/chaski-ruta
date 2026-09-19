import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePersonStatusDto {
  @IsIn(['ACTIVO', 'SUSPENDIDO'])
  status: 'ACTIVO' | 'SUSPENDIDO';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
