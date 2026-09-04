import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
// Uso: @Roles('SUPERADMIN', 'ADMINISTRADOR') sobre un metodo de controlador,
// combinado con RolesGuard.
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
