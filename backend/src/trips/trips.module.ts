import { Module } from '@nestjs/common';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';
import { GpsModule } from '../gps/gps.module';
import { NoticesModule } from '../notices/notices.module';

@Module({
  imports: [GpsModule, NoticesModule],
  controllers: [TripsController],
  providers: [TripsService],
  exports: [TripsService],
})
export class TripsModule {}
