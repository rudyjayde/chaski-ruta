import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { IsOptionalDni, IsOptionalLicense, IsOptionalPhone } from '../../common/validators';

// "Mi cuenta": lo que una persona puede corregir de SI MISMA. El correo, el rol
// y la asociacion no estan aqui a proposito -- con forbidNonWhitelisted, mandar
// cualquiera de ellos responde 400. DNI y celular vacios significan "no cambiar";
// el nombre nunca puede quedar vacio.
export class UpdateMyProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptionalDni()
  @IsString()
  dni?: string;

  @IsOptionalPhone()
  @IsString()
  phone?: string;

  // Solo conductores (ver PeopleService.updateMe).
  @IsOptionalLicense()
  @IsString()
  license?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  licenseCategory?: string;

  @IsOptional()
  @IsDateString({}, { message: 'La fecha de vencimiento de la licencia no es válida' })
  licenseExpiry?: string;
}
