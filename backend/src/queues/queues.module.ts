import { Module } from '@nestjs/common';
import { QueuesController } from './queues.controller';
import { QueuesService } from './queues.service';
import { GpsModule } from '../gps/gps.module';
import { NoticesModule } from '../notices/notices.module';

@Module({
  imports: [GpsModule, NoticesModule],
  controllers: [QueuesController],
  providers: [QueuesService],
  exports: [QueuesService],
})
export class QueuesModule {}
