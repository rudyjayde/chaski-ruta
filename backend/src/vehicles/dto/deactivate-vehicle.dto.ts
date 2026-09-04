import { IsString, MinLength } from 'class-validator';

export class DeactivateVehicleDto {
  @IsString()
  @MinLength(1)
  reason: string;
}
