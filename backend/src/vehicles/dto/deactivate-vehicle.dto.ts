import { IsString, MinLength, MaxLength } from 'class-validator';

export class DeactivateVehicleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason: string;
}
