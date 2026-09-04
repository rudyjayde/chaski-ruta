import { IsEmail, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateCompanyDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() ruc?: string;
  @IsOptional() @IsString() legalRep?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsIn(['ACTIVA', 'OBSERVADA', 'SUSPENDIDA']) status?: 'ACTIVA' | 'OBSERVADA' | 'SUSPENDIDA';
}
