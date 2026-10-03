import { IsOptional, IsString, IsUrl, MinLength, MaxLength } from 'class-validator';

export class ResolveSupportTicketDto {
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  resolution: string;

  @IsOptional()
  @IsUrl()
  evidenceUrl?: string;
}
