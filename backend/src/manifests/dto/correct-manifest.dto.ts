import { IsString, MinLength } from 'class-validator';

export class CorrectManifestDto {
  @IsString()
  @MinLength(5)
  reason: string;
}
