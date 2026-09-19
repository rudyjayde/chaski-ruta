import { IsArray, IsIn, IsOptional, IsString, MinLength, MaxLength } from 'class-validator';

// Aviso masivo de Super Admin (13 sept 2026, decidido con Jayde): ej. avisar
// un mantenimiento programado a todas las asociaciones, sin importar su plan
// (PRO, Operacion o GPS Vehicular todas reciben el mismo Notice real dentro
// de su panel -- nunca por WhatsApp). organizationIds vacio o ausente =
// todas las asociaciones; con IDs = solo esas (filtro real, no una opcion
// decorativa).
export class BroadcastNoticeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body: string;

  @IsIn(['CONDUCTORES', 'SOCIOS', 'AMBOS', 'ADMINISTRADORES'])
  audience: 'CONDUCTORES' | 'SOCIOS' | 'AMBOS' | 'ADMINISTRADORES';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  organizationIds?: string[];
}
