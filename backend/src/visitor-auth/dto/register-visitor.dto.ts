import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterVisitorDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  password: string;

  @IsOptional()
  @IsString()
  name?: string;
}
