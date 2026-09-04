import { IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class CreateVehicleDto {
  @IsString()
  @MinLength(1)
  code: string;

  @IsString()
  companyId: string;

  @IsIn(['SPRINTER', 'HIACE', 'MASTER'])
  vehicleType: 'SPRINTER' | 'HIACE' | 'MASTER';

  @IsString()
  @MinLength(3)
  plate: string;

  @IsString()
  model: string;

  @IsInt()
  @Min(1990)
  @Max(2100)
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
