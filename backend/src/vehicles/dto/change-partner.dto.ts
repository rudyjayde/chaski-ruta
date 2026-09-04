import { IsOptional, IsString, MinLength } from 'class-validator';

export class ChangePartnerDto {
  @IsString()
  @MinLength(1)
  partnerId: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
