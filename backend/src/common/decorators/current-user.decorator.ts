import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from '../../auth/jwt.strategy';

// Uso: metodo(@CurrentUser() user: JwtPayload)
// Trae siempre { sub, organizationId, role, email } de la persona autenticada.
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
