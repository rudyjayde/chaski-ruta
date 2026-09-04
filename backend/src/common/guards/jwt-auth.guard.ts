import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Protege cualquier ruta: exige un JWT valido en el header Authorization: Bearer <token>.
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
