import { IsBoolean, IsEmail, IsIn, IsNumber, IsOptional, IsString, MinLength, MaxLength, Min, Max } from 'class-validator';
import { COMPLAINT_DOCUMENT_TYPES, IsDocumentNumber, IsOptionalPhone, type DocumentType } from '../../common/validators';

// Enviado desde la landing publica (pagina /libro-de-reclamaciones), sin
// autenticacion -- cualquier persona puede reclamar, tenga o no cuenta en la
// plataforma. Campos alineados al formato de hoja de reclamacion que exige
// INDECOPI (Ley 29571 y su reglamento de libro de reclamaciones virtual).
export class CreateComplaintDto {
  @IsIn(['RECLAMO', 'QUEJA'])
  type: 'RECLAMO' | 'QUEJA';

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  consumerName: string;

  // DNI (por defecto), CE, PASAPORTE o RUC.
  @IsOptional()
  @IsIn([...COMPLAINT_DOCUMENT_TYPES])
  consumerDocumentType?: DocumentType;

  @IsString()
  @IsDocumentNumber('consumerDocumentType')
  consumerDocument: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  consumerAddress?: string;

  @IsEmail()
  @MaxLength(254)
  consumerEmail: string;

  @IsOptionalPhone()
  @IsString()
  consumerPhone?: string;

  @IsOptional()
  @IsBoolean()
  isMinor?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  guardianName?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(300)
  serviceDescription: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000000)
  claimedAmount?: number;

  @IsString()
  @MinLength(10)
  @MaxLength(3000)
  detail: string;

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  consumerRequest: string;

  // Campo trampa anti-robots: las personas no lo ven ni lo llenan (la pantalla lo
  // esconde); si llega con algo, el envio se descarta en silencio.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}
