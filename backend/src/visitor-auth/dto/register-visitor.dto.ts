import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsSecurePassword } from '../../common/validators';

export class RegisterVisitorDto {
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @IsSecurePassword()
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  // Campo trampa anti-robots: las personas no lo ven ni lo llenan (la pantalla lo
  // esconde); si llega con algo, el envio se descarta en silencio.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}
