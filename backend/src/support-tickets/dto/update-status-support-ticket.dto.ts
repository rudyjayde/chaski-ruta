import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

// Movimientos de estado que no son ni clasificar, ni asignar, ni escalar, ni resolver, ni cerrar
// (ej. ponerlo "en espera" de una respuesta del administrador, o reabrirlo a EN_ANALISIS).
export class UpdateStatusSupportTicketDto {
  @IsIn(['ABIERTO', 'EN_ANALISIS', 'EN_ESPERA'])
  status: 'ABIERTO' | 'EN_ANALISIS' | 'EN_ESPERA';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
