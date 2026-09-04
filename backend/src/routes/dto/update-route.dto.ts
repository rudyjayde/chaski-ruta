import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateRouteDto {
  @IsOptional() @IsString() @IsNotEmpty() origin?: string;
  @IsOptional() @IsString() @IsNotEmpty() destination?: string;
}
