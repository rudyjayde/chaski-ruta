import { IsOptional, IsString, MaxLength } from 'class-validator';

export class LinkProblemSupportTicketDto {
  // '' (string vacio) = desvincular. undefined = no tocar este campo.
  @IsOptional()
  @IsString()
  problemId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  rfcRef?: string;
}
