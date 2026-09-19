import { IsIn, IsOptional, IsString, MinLength, MaxLength } from 'class-validator';

export class RespondSupportTicketDto {
  @IsIn(['EN_PROGRESO', 'RESUELTO'])
  status: 'EN_PROGRESO' | 'RESUELTO';

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  response?: string;
}
