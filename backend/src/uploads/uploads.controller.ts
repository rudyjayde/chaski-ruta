import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UploadsService } from './uploads.service';
import { UploadImageDto } from './dto/upload-image.dto';

// Cualquier usuario autenticado (socio, conductor, admin, super admin) puede
// subir una imagen: logo de asociacion, QR de billetera, etc. La imagen viaja
// como data URL (igual que hoy) pero el backend la sube a Cloudinary y solo
// devuelve la URL final; nada de base64 se guarda en la base de datos.
@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post('image')
  image(@Body() dto: UploadImageDto) {
    return this.uploads.uploadDataUrl(dto.dataUrl, dto.folder);
  }
}
