import { Module } from '@nestjs/common';
import { RelocationsController } from './relocations.controller';
import { RelocationsService } from './relocations.service';

@Module({
  controllers: [RelocationsController],
  providers: [RelocationsService],
  exports: [RelocationsService],
})
export class RelocationsModule {}
