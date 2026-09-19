import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateGpsAlertDto {
  @IsIn(['EN_REVISION', 'REVISADA', 'DESCARTADA'])
  status: 'EN_REVISION' | 'REVISADA' | 'DESCARTADA';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
