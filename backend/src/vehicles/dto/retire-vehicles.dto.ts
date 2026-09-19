import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RetireVehiclesDto {
  @IsArray() @ArrayNotEmpty() @ArrayMaxSize(200) @IsString({ each: true }) ids: string[];
  @IsString() @IsNotEmpty() @MaxLength(500) reason: string;
}
