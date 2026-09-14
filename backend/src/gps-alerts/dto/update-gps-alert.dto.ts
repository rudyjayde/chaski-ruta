import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateGpsAlertDto {
  @IsIn(['EN_REVISION', 'REVISADA', 'DESCARTADA'])
  status: 'EN_REVISION' | 'REVISADA' | 'DESCARTADA';

  @IsOptional()
  @IsString()
  note?: string;
}
