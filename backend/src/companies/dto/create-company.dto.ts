import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsOptionalPhone, IsOptionalRuc } from '../../common/validators';

// Solo el nombre es obligatorio -- "Empresas integrantes" en el wizard de
// creacion siempre fue una lista de NOMBRES nada mas (nunca pedia RUC/
// representante/etc ahi), asi que exigir esos datos aqui habria sido un
// paso atras en la usabilidad. Se pueden completar despues, por eso Company
// los tiene como opcionales en el schema.
export class CreateCompanyDto {
  @IsString() @IsNotEmpty() @MaxLength(150) name: string;
  @IsString() @IsOptionalRuc() ruc?: string;
  @IsOptional() @IsString() @MaxLength(120) legalRep?: string;
  @IsOptionalPhone() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
}
