import { IsIn } from 'class-validator';

export class AdvanceQueueDto {
  // Lo unico que el administrador avanza a mano es llamar a la unidad. Desde
  // LLAMADO lo siguiente es salir a ruta (POST .../depart), no otro estado.
  @IsIn(['LLAMADO'])
  toStatus: 'LLAMADO';
}
