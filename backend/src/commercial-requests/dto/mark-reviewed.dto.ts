import { IsOptional, IsString } from 'class-validator';

export class MarkReviewedDto {
  @IsOptional()
  @IsString()
  notes?: string;
}
