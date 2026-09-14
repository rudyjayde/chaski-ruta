import { IsString, MinLength } from 'class-validator';

export class CreateSupportTicketDto {
  @IsString()
  @MinLength(3)
  subject: string;

  @IsString()
  @MinLength(3)
  message: string;
}
