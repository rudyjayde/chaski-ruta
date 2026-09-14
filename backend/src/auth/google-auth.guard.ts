import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Reusa el mismo callback de Google ya registrado en la consola de Google
// (GOOGLE_CALLBACK_URL) para dos flujos distintos -- landing publica vs login
// interno de la app -- pasando la diferencia por el parametro `state` de
// OAuth (que Google devuelve tal cual en el callback). Asi no hace falta
// registrar una segunda URL de redireccion en Google.
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const flow = req.query?.flow === 'landing' ? 'landing' : 'app';
    return { state: flow };
  }
}
