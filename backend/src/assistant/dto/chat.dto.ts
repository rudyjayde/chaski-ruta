import { IsArray, IsIn, IsOptional, IsString, ValidateNested, MaxLength, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';

class ChatTurnDto {
  @IsIn(['user', 'assistant'])
  role: 'user' | 'assistant';

  @IsString()
  @MaxLength(4000)
  content: string;
}

// message: lo que acaba de escribir el usuario. conversationId: la
// conversacion guardada a la que pertenece (sin el, se crea una nueva). El
// contexto previo lo lee el backend de la base de datos.
//
// history: forma anterior, cuando el frontend mantenia la conversacion en
// memoria. Se sigue aceptando para que un frontend viejo no reciba 400
// mientras se despliegan backend y frontend por separado.
export class ChatDto {
  @IsString()
  @MaxLength(2000)
  message: string;

  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatTurnDto)
  @ArrayMaxSize(20)
  history?: ChatTurnDto[];
}
