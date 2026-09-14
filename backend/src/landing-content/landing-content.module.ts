import { Module } from '@nestjs/common';
import { LandingContentController } from './landing-content.controller';
import { LandingContentService } from './landing-content.service';

@Module({
  controllers: [LandingContentController],
  providers: [LandingContentService],
})
export class LandingContentModule {}
