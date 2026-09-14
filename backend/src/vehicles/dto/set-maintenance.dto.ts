import { IsNumber, IsOptional, Min } from 'class-validator';

// Mantenimiento predictivo (plan-pro.md §11.1): ambos numeros los define el
// administrador segun la realidad de su flota -- el sistema nunca inventa un
// intervalo de servicio. serviceIntervalKm ausente/null = apaga el
// seguimiento para esta unidad (deja de generar el aviso).
export class SetMaintenanceDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  lastServiceKm?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  serviceIntervalKm?: number;
}
