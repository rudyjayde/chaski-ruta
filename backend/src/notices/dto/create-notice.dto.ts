import { IsIn, IsString, MinLength } from 'class-validator';

export class CreateNoticeDto {
  @IsString()
  @MinLength(1)
  title: string;

  @IsString()
  @MinLength(1)
  body: string;

  @IsIn(['CONDUCTORES', 'SOCIOS', 'AMBOS', 'ADMINISTRADORES'])
  audience: 'CONDUCTORES' | 'SOCIOS' | 'AMBOS' | 'ADMINISTRADORES';
}
