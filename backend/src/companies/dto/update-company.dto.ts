import { IsEmail, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsOptionalPhone, IsOptionalRucFormat } from '../../common/validators';

export class UpdateCompanyDto {
  @IsOptional() @IsString() @MaxLength(150) name?: string;
  @IsString() @IsOptionalRucFormat() ruc?: string;
  @IsOptional() @IsString() @MaxLength(120) legalRep?: string;
  @IsOptionalPhone() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsIn(['ACTIVA', 'OBSERVADA', 'SUSPENDIDA']) status?: 'ACTIVA' | 'OBSERVADA' | 'SUSPENDIDA';
}
