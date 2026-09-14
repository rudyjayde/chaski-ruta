import { IsString, MinLength } from 'class-validator';

export class RespondComplaintDto {
  @IsString()
  @MinLength(3)
  providerResponse: string;
}
