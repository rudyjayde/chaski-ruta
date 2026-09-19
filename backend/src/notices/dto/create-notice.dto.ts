import { IsIn, IsString, MinLength, MaxLength } from 'class-validator';

export class CreateNoticeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body: string;

  @IsIn(['CONDUCTORES', 'SOCIOS', 'AMBOS', 'ADMINISTRADORES'])
  audience: 'CONDUCTORES' | 'SOCIOS' | 'AMBOS' | 'ADMINISTRADORES';
}
