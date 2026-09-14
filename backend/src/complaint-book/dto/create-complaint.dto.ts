import { IsBoolean, IsEmail, IsIn, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';

// Enviado desde la landing publica (pagina /libro-de-reclamaciones), sin
// autenticacion -- cualquier persona puede reclamar, tenga o no cuenta en la
// plataforma. Campos alineados al formato de hoja de reclamacion que exige
// INDECOPI (Ley 29571 y su reglamento de libro de reclamaciones virtual).
export class CreateComplaintDto {
  @IsIn(['RECLAMO', 'QUEJA'])
  type: 'RECLAMO' | 'QUEJA';

  @IsString()
  @MinLength(2)
  consumerName: string;

  @IsString()
  @MinLength(5)
  consumerDocument: string;

  @IsOptional()
  @IsString()
  consumerAddress?: string;

  @IsEmail()
  consumerEmail: string;

  @IsOptional()
  @IsString()
  consumerPhone?: string;

  @IsOptional()
  @IsBoolean()
  isMinor?: boolean;

  @IsOptional()
  @IsString()
  guardianName?: string;

  @IsString()
  @MinLength(3)
  serviceDescription: string;

  @IsOptional()
  @IsNumber()
  claimedAmount?: number;

  @IsString()
  @MinLength(10)
  detail: string;

  @IsString()
  @MinLength(3)
  consumerRequest: string;
}
