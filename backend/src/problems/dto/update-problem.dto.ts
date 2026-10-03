import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateProblemDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  rootCause?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  workaround?: string;

  @IsOptional()
  @IsBoolean()
  knownError?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  proposedSolution?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  rfcRef?: string;

  @IsOptional()
  @IsIn(['REGISTRADO', 'EN_INVESTIGACION', 'ERROR_CONOCIDO', 'EN_SOLUCION', 'CERRADO'])
  status?: 'REGISTRADO' | 'EN_INVESTIGACION' | 'ERROR_CONOCIDO' | 'EN_SOLUCION' | 'CERRADO';
}
