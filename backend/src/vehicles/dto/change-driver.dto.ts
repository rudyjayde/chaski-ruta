import { IsOptional, IsString, MinLength, MaxLength } from 'class-validator';

export class ChangeDriverDto {
  @IsString()
  @MinLength(1)
  currentDriverId: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
