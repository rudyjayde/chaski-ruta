import { Module } from '@nestjs/common';
import { DigestController } from './digest.controller';
import { DigestService } from './digest.service';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [DigestController],
  providers: [DigestService],
})
export class DigestModule {}
