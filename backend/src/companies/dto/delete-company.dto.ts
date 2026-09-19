import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class DeleteCompanyDto {
  @IsString() @IsNotEmpty() @MaxLength(500) reason: string;
}
