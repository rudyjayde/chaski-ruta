import { IsString, MinLength, MaxLength } from 'class-validator';

export class RespondComplaintDto {
  @IsString()
  @MinLength(3)
  @MaxLength(3000)
  providerResponse: string;
}
