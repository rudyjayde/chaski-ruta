import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

// Sube cualquier imagen (logo de asociacion, QR de billetera, futuras fotos de
// conductor/vehiculo, etc.) a Cloudinary y devuelve una URL corta y liviana.
// Nunca se guarda la imagen en base64 en la base de datos: solo esta URL.
@Injectable()
export class UploadsService {
  private configured = false;

  constructor(private config: ConfigService) {
    const cloud_name = this.config.get<string>('CLOUDINARY_CLOUD_NAME');
    const api_key = this.config.get<string>('CLOUDINARY_API_KEY');
    const api_secret = this.config.get<string>('CLOUDINARY_API_SECRET');
    if (cloud_name && api_key && api_secret) {
      cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
      this.configured = true;
    }
  }

  /**
   * Chequeo real de salud de Cloudinary (12 sept 2026, Salud tecnica de
   * Super Admin): usa el endpoint /ping de la API de administracion --
   * disenado justo para esto (liviano, sin costo), confirma conectividad Y
   * que las credenciales configuradas siguen siendo validas.
   */
  async checkHealth(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    if (!this.configured) {
      return { ok: false, latencyMs: 0, error: 'Cloudinary no configurado (CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET en backend/.env)' };
    }
    try {
      await cloudinary.api.ping();
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err: any) {
      return { ok: false, latencyMs: Date.now() - start, error: err?.message || 'error desconocido' };
    }
  }

  async uploadDataUrl(dataUrl: string, folder = 'general'): Promise<{ url: string; publicId: string }> {
    if (!dataUrl || !dataUrl.startsWith('data:image')) {
      throw new BadRequestException('Imagen invalida.');
    }
    if (!this.configured) {
      throw new InternalServerErrorException(
        'Cloudinary no esta configurado en el backend. Agrega CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET en backend/.env y reinicia el servidor.',
      );
    }
    try {
      const safeFolder = String(folder).replace(/[^a-zA-Z0-9_-]/g, '') || 'general';
      const result = await cloudinary.uploader.upload(dataUrl, {
        folder: `chaski/${safeFolder}`,
        resource_type: 'image',
      });
      // Entrega automatica optimizada: formato (webp/avif segun navegador) y
      // calidad automaticos, mismo patron que ya usa el logo de ATIPCAR.
      const url = result.secure_url.replace('/upload/', '/upload/f_auto,q_auto/');
      return { url, publicId: result.public_id };
    } catch (err: any) {
      throw new InternalServerErrorException('No se pudo subir la imagen a Cloudinary: ' + (err?.message || 'error desconocido'));
    }
  }
}
