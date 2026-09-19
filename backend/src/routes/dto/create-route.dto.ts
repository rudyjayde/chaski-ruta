import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateRouteDto {
  @IsString() @IsNotEmpty() @MaxLength(100) origin: string;
  @IsString() @IsNotEmpty() @MaxLength(100) destination: string;
}
