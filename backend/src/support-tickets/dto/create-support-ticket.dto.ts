import { IsEnum, IsOptional, IsString, IsUrl, MinLength, MaxLength } from 'class-validator';
import { SupportTicketType, SupportTicketCategory, SupportTicketImpact, SupportTicketUrgency } from '@prisma/client';

// Mesa de servicio ITIL 4 (OE4 tesis, 2 oct 2026): el administrador clasifica su propio ticket al
// crearlo -- el Super Admin (N1) puede corregirlo despues en "clasificar" (ver classify.dto.ts).
export class CreateSupportTicketDto {
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  subject: string;

  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  message: string;

  @IsEnum(SupportTicketType)
  type: SupportTicketType;

  @IsEnum(SupportTicketCategory)
  category: SupportTicketCategory;

  @IsEnum(SupportTicketImpact)
  impact: SupportTicketImpact;

  @IsEnum(SupportTicketUrgency)
  urgency: SupportTicketUrgency;

  // URL de Cloudinary ya subida (POST /uploads/image) -- nunca un archivo ni base64 aqui.
  @IsOptional()
  @IsUrl()
  evidenceUrl?: string;
}
