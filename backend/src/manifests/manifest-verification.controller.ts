import { Controller, Get, Param } from '@nestjs/common';
import { ManifestsService } from './manifests.service';

// Verificacion PUBLICA de un manifiesto (escaneando el QR de un manifiesto
// impreso) -- a proposito en un controller SEPARADO de ManifestsController,
// que lleva guards de clase para todo lo demas. Nunca requiere cuenta ni
// pertenece a ninguna asociacion: cualquiera con el link puede consultarlo,
// igual que abrir un PDF ya impreso.
@Controller('manifests-public')
export class ManifestVerificationController {
  constructor(private manifests: ManifestsService) {}

  @Get('verify/:token')
  verify(@Param('token') token: string) {
    return this.manifests.verifyToken(token);
  }
}
