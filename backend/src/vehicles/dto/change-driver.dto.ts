import { IsOptional, IsString, MinLength } from 'class-validator';

export class ChangeDriverDto {
  @IsString()
  @MinLength(1)
  currentDriverId: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
