import { IsIn, IsOptional, IsString } from 'class-validator';

// traccarDeviceId vacio o ausente = desvincular (la unidad vuelve a no tener
// GPS real, el mapa en vivo deja de mostrarla).
export class SetGpsDeviceDto {
  @IsOptional()
  @IsString()
  traccarDeviceId?: string;

  // Dato PURAMENTE informativo (12 sept 2026) -- control interno de Super
  // Admin sobre que chip tiene cada equipo, ninguna alerta/geocerca/bloqueo
  // de motor lo lee.
  @IsOptional()
  @IsIn(['CLARO', 'MOVISTAR', 'BITEL', 'ENTEL'])
  simOperator?: string;

  @IsOptional()
  @IsString()
  simNumber?: string;
}
