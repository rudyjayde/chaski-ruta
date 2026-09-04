import { IsOptional, IsString } from 'class-validator';

// traccarDeviceId vacio o ausente = desvincular (la unidad vuelve a no tener
// GPS real, el mapa en vivo deja de mostrarla).
export class SetGpsDeviceDto {
  @IsOptional()
  @IsString()
  traccarDeviceId?: string;
}
