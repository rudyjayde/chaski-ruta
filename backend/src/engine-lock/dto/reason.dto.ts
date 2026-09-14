import { IsString, MinLength } from 'class-validator';

// Motivo obligatorio compartido por cancelar y restaurar.
export class ReasonDto {
  @IsString()
  @MinLength(1)
  reason: string;
}
