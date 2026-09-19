import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateRouteDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) origin?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) destination?: string;
}
