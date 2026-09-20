import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class DeleteOrganizationDto {
  @IsString() @IsNotEmpty() @MaxLength(500) reason: string;
}
