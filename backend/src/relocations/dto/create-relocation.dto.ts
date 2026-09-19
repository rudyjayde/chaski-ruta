import { ArrayMinSize, IsArray, IsIn, IsString, MinLength, MaxLength, ArrayMaxSize } from 'class-validator';

export class CreateRelocationDto {
  @IsIn(['JULI', 'PUNO'])
  fromTerminal: 'JULI' | 'PUNO';

  @IsIn(['JULI', 'PUNO'])
  toTerminal: 'JULI' | 'PUNO';

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason: string;

  @IsString()
  @MaxLength(100)
  windowLabel: string;

  @IsString()
  @MaxLength(300)
  compensation: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @ArrayMaxSize(100)
  vehicleIds: string[];
}
