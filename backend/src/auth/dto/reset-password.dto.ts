import { IsString } from 'class-validator';
import { IsSecurePassword } from '../../common/validators';

export class ResetPasswordDto {
  @IsString()
  token: string;

  @IsString()
  @IsSecurePassword()
  password: string;
}
