import { IsIn, IsString } from 'class-validator';

// Foto del respaldo en papel -- nunca se guarda como archivo permanente hoy
// (no hay integracion de Cloudinary en el backend todavia), solo se usa en
// memoria para la lectura de Claude vision y se descarta. Ver nota en
// digitizeSuggest() de manifests.service.ts.
export class DigitizeSuggestDto {
  @IsString()
  imageBase64: string;

  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
}
