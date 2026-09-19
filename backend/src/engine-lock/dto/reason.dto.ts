import { IsString, MinLength, MaxLength } from 'class-validator';

// Motivo obligatorio compartido por cancelar y restaurar.
export class ReasonDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason: string;
}
