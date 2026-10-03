import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateProblemDto {
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  title: string;

  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  description: string;

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
}
