import { IsString, MinLength } from 'class-validator';

export class AlertTripDto {
  @IsString()
  @MinLength(3)
  note: string;
}
