import { IsOptional, IsString, MaxLength } from 'class-validator';

export class MarkReviewedDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
