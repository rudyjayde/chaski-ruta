import { IsIn } from 'class-validator';

export class AdvanceQueueDto {
  @IsIn(['LLAMADO', 'EN_TERMINAL', 'EMBARCANDO', 'LISTO'])
  toStatus: 'LLAMADO' | 'EN_TERMINAL' | 'EMBARCANDO' | 'LISTO';
}
