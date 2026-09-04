import { IsArray, IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class ChatTurnDto {
  @IsIn(['user', 'assistant'])
  role: 'user' | 'assistant';

  @IsString()
  content: string;
}

// message: lo que acaba de escribir el usuario. history: turnos previos de esta
// misma conversacion (el frontend la mantiene; el backend no guarda memoria
// entre requests) para que el asistente pueda responder cosas como "y el otro
// vehiculo que te pregunte antes?".
export class ChatDto {
  @IsString()
  message: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatTurnDto)
  history?: ChatTurnDto[];
}
