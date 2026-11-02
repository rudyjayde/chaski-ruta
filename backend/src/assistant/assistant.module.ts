import { Module } from '@nestjs/common';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { AssistantRetentionService } from './assistant-retention.service';

@Module({
  controllers: [AssistantController],
  providers: [AssistantService, AssistantRetentionService],
})
export class AssistantModule {}
