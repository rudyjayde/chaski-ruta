import { IsInt, IsString, Min, Max } from 'class-validator';

export class OpenManifestDto {
  @IsString()
  tripId: string;

  @IsInt()
  @Min(1)
  @Max(60)
  capacity: number;
}
