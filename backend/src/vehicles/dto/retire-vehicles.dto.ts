import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsNotEmpty, IsString } from 'class-validator';

export class RetireVehiclesDto {
  @IsArray() @ArrayNotEmpty() @ArrayMaxSize(200) @IsString({ each: true }) ids: string[];
  @IsString() @IsNotEmpty() reason: string;
}
