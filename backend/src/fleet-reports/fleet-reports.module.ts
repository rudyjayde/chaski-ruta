import { Module } from '@nestjs/common';
import { GpsModule } from '../gps/gps.module';
import { FleetReportsService } from './fleet-reports.service';
import { FleetReportsController } from './fleet-reports.controller';

@Module({
  imports: [GpsModule],
  controllers: [FleetReportsController],
  providers: [FleetReportsService],
})
export class FleetReportsModule {}
