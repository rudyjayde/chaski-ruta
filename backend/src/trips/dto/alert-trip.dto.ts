import { IsString, MinLength, MaxLength } from 'class-validator';

export class AlertTripDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  note: string;
}
