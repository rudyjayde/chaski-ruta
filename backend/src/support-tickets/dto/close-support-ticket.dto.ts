import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CloseSupportTicketDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
