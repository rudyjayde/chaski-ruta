import { IsOptional, IsString } from 'class-validator';

// dataUrl: imagen codificada como data URL (base64) que ya arma el navegador
// al leer el archivo elegido con "Adjuntar imagen". folder agrupa los assets
// en Cloudinary (logos, wallets, etc.) para mantener orden.
export class UploadImageDto {
  @IsString() dataUrl: string;
  @IsOptional() @IsString() folder?: string;
}
