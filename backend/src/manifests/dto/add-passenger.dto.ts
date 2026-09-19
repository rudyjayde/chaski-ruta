import { IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, Min, MinLength, MaxLength, Max } from 'class-validator';
import { DOCUMENT_TYPES, IsDocumentNumber, type DocumentType } from '../../common/validators';

export class AddPassengerDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  // Regla global: DNI peruano = exactamente 8 dígitos numéricos, sin letras ni guiones.
  // DNI (por defecto), CE o PASAPORTE. `dni` guarda el numero del documento.
  @IsOptional()
  @IsIn([...DOCUMENT_TYPES])
  documentType?: DocumentType;

  @IsString()
  @IsDocumentNumber()
  dni: string;

  @IsInt()
  @Min(1)
  @Max(60)
  seat: number;

  @IsNumber()
  @Min(0)
  @Max(10000)
  fare: number;

  @IsIn(['EFECTIVO', 'YAPE', 'PLIN', 'TRANSFERENCIA', 'QR'])
  paymentMethod: 'EFECTIVO' | 'YAPE' | 'PLIN' | 'TRANSFERENCIA' | 'QR';

  @IsString()
  @MaxLength(100)
  origin: string;

  @IsString()
  @MaxLength(100)
  destination: string;

  // No obligatorio (12 sept 2026, decidido con Jayde): si el conductor lo
  // llena, se guarda y se le envia un correo tipo boleto a ese pasajero.
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;
}
