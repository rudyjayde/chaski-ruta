import { IsString, MinLength, MaxLength } from 'class-validator';

export class CreateSupportTicketDto {
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  subject: string;

  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  message: string;
}
