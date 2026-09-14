import { IsEmail, IsString } from 'class-validator';

export class LoginVisitorDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}
