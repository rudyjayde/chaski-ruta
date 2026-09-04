import { IsIn, IsString, MinLength } from 'class-validator';

// Solo para agentes de prueba en desarrollo — nunca en produccion.
// Ver AuthController.devLogin() y ALLOW_DEV_LOGIN/DEV_LOGIN_SECRET en backend/.env.
export class DevLoginDto {
  @IsString()
  @MinLength(1)
  email: string;

  @IsIn(['CONDUCTOR', 'SOCIO', 'ADMINISTRADOR', 'SUPERADMIN'])
  role: 'CONDUCTOR' | 'SOCIO' | 'ADMINISTRADOR' | 'SUPERADMIN';

  @IsString()
  key: string;
}
