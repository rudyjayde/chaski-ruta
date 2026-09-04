import { IsIn, IsString, MinLength } from 'class-validator';

// Via 3 del escape de 3 vias (§3.6): intervencion manual del gerente/administrador,
// SIEMPRE con motivo obligatorio y registro de auditoria.
export class OverrideQueueDto {
  @IsIn(['AUSENTE', 'RETIRADO', 'REQUEUE'])
  action: 'AUSENTE' | 'RETIRADO' | 'REQUEUE';

  @IsString()
  @MinLength(3)
  reason: string;
}
