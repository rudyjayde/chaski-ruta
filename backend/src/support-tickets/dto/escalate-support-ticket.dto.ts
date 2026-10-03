import { IsIn, IsOptional, IsString, MinLength, MaxLength } from 'class-validator';

export class EscalateSupportTicketDto {
  // Nunca a N1 -- escalar siempre sube de nivel; bajar de nivel no es un caso de uso pedido.
  @IsIn(['N2', 'N3'])
  supportLevel: 'N2' | 'N3';

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  assigneeName?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  note: string;
}
