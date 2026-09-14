import { IsString, MinLength } from 'class-validator';

// El motivo es obligatorio -- mismo criterio que cualquier otra excepcion
// sensible del sistema (cambio de plan, desactivar unidad, etc.).
export class CreateEngineLockRequestDto {
  @IsString()
  @MinLength(1)
  reason: string;
}
