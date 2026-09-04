import { IsInt, IsString, Min } from 'class-validator';

export class OpenManifestDto {
  @IsString()
  tripId: string;

  @IsInt()
  @Min(1)
  capacity: number;
}
