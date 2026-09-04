import { IsIn, IsInt, IsNumber, IsString, Matches, Min, MinLength } from 'class-validator';

export class AddPassengerDto {
  @IsString()
  @MinLength(2)
  name: string;

  // Regla global: DNI peruano = exactamente 8 dígitos numéricos, sin letras ni guiones.
  @IsString()
  @Matches(/^\d{8}$/, { message: 'El DNI debe tener exactamente 8 dígitos numéricos' })
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
}
