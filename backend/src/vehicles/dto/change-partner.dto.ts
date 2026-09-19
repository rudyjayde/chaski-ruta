import { IsOptional, IsString, MinLength, MaxLength } from 'class-validator';

export class ChangePartnerDto {
  @IsString()
  @MinLength(1)
  partnerId: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
