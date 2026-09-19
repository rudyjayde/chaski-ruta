import { IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { IsDni } from '../../common/validators';

export class AddPassengerDto {
  @IsString()
  @MinLength(2)
  name: string;

  // Regla global: DNI peruano = exactamente 8 dígitos numéricos, sin letras ni guiones.
  @IsString()
  @IsDni()
  dni: string;

  @IsInt()
  @Min(1)
  seat: number;

  @IsNumber()
  fare: number;

  @IsIn(['EFECTIVO', 'YAPE', 'PLIN', 'TRANSFERENCIA', 'QR'])
  paymentMethod: 'EFECTIVO' | 'YAPE' | 'PLIN' | 'TRANSFERENCIA' | 'QR';

  @IsString()
  origin: string;

  @IsString()
  destination: string;

  // No obligatorio (12 sept 2026, decidido con Jayde): si el conductor lo
  // llena, se guarda y se le envia un correo tipo boleto a ese pasajero.
  @IsOptional()
  @IsEmail()
  email?: string;
}
