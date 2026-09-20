import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class DeletePersonDto {
  @IsString() @IsNotEmpty() @MaxLength(500) reason: string;
}
