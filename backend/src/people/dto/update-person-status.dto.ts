import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdatePersonStatusDto {
  @IsIn(['ACTIVO', 'SUSPENDIDO'])
  status: 'ACTIVO' | 'SUSPENDIDO';

  @IsOptional()
  @IsString()
  reason?: string;
}
