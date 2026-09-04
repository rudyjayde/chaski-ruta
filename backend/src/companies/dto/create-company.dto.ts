import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

// Solo el nombre es obligatorio -- "Empresas integrantes" en el wizard de
// creacion siempre fue una lista de NOMBRES nada mas (nunca pedia RUC/
// representante/etc ahi), asi que exigir esos datos aqui habria sido un
// paso atras en la usabilidad. Se pueden completar despues, por eso Company
// los tiene como opcionales en el schema.
export class CreateCompanyDto {
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsString() ruc?: string;
  @IsOptional() @IsString() legalRep?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
}
