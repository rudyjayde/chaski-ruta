import { IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength, MaxLength } from 'class-validator';
import { IsPlate, IsVehicleYear } from '../../common/validators';

export class CreateVehicleDto {
  // Opcional (MEJ-002): si no se manda, el backend asigna el siguiente
  // correlativo de 3 digitos para la asociacion (ver VehiclesService.create).
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(10)
  code?: string;

  @IsString()
  companyId: string;

  // OTRO (QA 20 sept 2026): la unidad no es ninguna de las tres del catalogo --
  // model llega como texto libre en vez de tener que ser una de VEHICLE_MODELS
  // (ver el chequeo cruzado en VehiclesService.create).
  @IsIn(['SPRINTER', 'HIACE', 'MASTER', 'OTRO'])
  vehicleType: 'SPRINTER' | 'HIACE' | 'MASTER' | 'OTRO';

  @IsString()
  @IsPlate()
  plate: string;

  // Marca + modelo: del catalogo (ver vehicle-catalog.ts) si vehicleType no es
  // OTRO, o texto libre "Marca Modelo" cuando el usuario elige "Otro".
  @IsString()
  @MinLength(1)
  @MaxLength(60)
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
