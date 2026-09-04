import { ArrayMinSize, IsArray, IsIn, IsString, MinLength } from 'class-validator';

export class CreateRelocationDto {
  @IsIn(['JULI', 'PUNO'])
  fromTerminal: 'JULI' | 'PUNO';

  @IsIn(['JULI', 'PUNO'])
  toTerminal: 'JULI' | 'PUNO';

  @IsString()
  @MinLength(5)
  reason: string;

  @IsString()
  windowLabel: string;

  @IsString()
  compensation: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  vehicleIds: string[];
}
