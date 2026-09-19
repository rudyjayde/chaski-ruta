import { IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength, MaxLength } from 'class-validator';
import { IsPlate, IsVehicleYear } from '../../common/validators';
import { VEHICLE_MODELS } from '../vehicle-catalog';

export class CreateVehicleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(10)
  code: string;

  @IsString()
  companyId: string;

  @IsIn(['SPRINTER', 'HIACE', 'MASTER'])
  vehicleType: 'SPRINTER' | 'HIACE' | 'MASTER';

  @IsString()
  @IsPlate()
  plate: string;

  // Marca + modelo del catalogo (ver vehicle-catalog.ts), ej. "Toyota Hiace".
  @IsIn(VEHICLE_MODELS, { message: `La marca/modelo debe ser una de: ${VEHICLE_MODELS.join(', ')}` })
  model: string;

  @IsInt({ message: 'El año debe ser un número de 4 dígitos' })
  @Min(1990, { message: 'El año debe ser 1990 o posterior' })
  @Max(2100, { message: 'El año no es válido' })
  @IsVehicleYear()
  year: number;

  @IsOptional()
  @IsIn(['JULI_PUNO', 'PUNO_JULI', 'AMBAS'])
  routeAssignment?: 'JULI_PUNO' | 'PUNO_JULI' | 'AMBAS';

  @IsOptional()
  @IsString()
  partnerId?: string;

  @IsOptional()
  @IsString()
  currentDriverId?: string;
}
