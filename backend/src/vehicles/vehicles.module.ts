import { Module } from '@nestjs/common';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';
import { QueuesModule } from '../queues/queues.module';

@Module({
  controllers: [VehiclesController],
  imports: [QueuesModule],
  providers: [VehiclesService],
  exports: [VehiclesService],
})
export class VehiclesModule {}
