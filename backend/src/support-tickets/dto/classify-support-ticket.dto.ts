import { IsEnum, IsOptional } from 'class-validator';
import { SupportTicketCategory, SupportTicketImpact, SupportTicketUrgency } from '@prisma/client';

// Super Admin (N1) corrige lo que eligio el administrador -- al menos impact o urgency debe venir
// para que tenga sentido llamar a este endpoint (el servicio lo valida); category es opcional.
export class ClassifySupportTicketDto {
  @IsOptional()
  @IsEnum(SupportTicketCategory)
  category?: SupportTicketCategory;

  @IsOptional()
  @IsEnum(SupportTicketImpact)
  impact?: SupportTicketImpact;

  @IsOptional()
  @IsEnum(SupportTicketUrgency)
  urgency?: SupportTicketUrgency;
}
