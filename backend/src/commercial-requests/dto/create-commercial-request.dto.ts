import { IsEmail, IsIn, IsObject, IsOptional, IsString, MinLength } from 'class-validator';

// Enviado desde la landing publica, sin autenticacion (docs/planes/
// landing-publica-y-solicitudes-comerciales.md §3-§5). `answers` guarda el
// formulario completo tal como el interesado lo respondio -- ver comentario
// en schema.prisma sobre CommercialRequest.
export class CreateCommercialRequestDto {
  @IsIn(['OPERACION', 'PRO', 'GPS_VEHICULAR'])
  solution: 'OPERACION' | 'PRO' | 'GPS_VEHICULAR';

  @IsString()
  @MinLength(2)
  contactName: string;

  @IsEmail()
  contactEmail: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  // Nombre de la asociacion (Operacion/PRO). Vacio en GPS Vehicular individual.
  @IsOptional()
  @IsString()
  orgName?: string;

  // RUC de la asociacion, o DNI/RUC del socio en GPS Vehicular.
  @IsOptional()
  @IsString()
  ruc?: string;

  // El resto del formulario (rutas, cantidad de unidades, comentarios, etc.)
  // -- distinto por solucion, ver Landing.tsx. Se guarda tal cual, sin validar
  // cada campo aqui, para no romper cuando el formulario administrable
  // (Nivel 2 del roadmap) empiece a variar las preguntas por asociacion.
  @IsObject()
  answers: Record<string, unknown>;
}
