import { IsString, MinLength, MaxLength } from 'class-validator';

export class AssignSupportTicketDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  assigneeName: string;
}
