import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class RespondSupportTicketDto {
  @IsIn(['EN_PROGRESO', 'RESUELTO'])
  status: 'EN_PROGRESO' | 'RESUELTO';

  @IsOptional()
  @IsString()
  @MinLength(1)
  response?: string;
}
