import { Module } from '@nestjs/common';
import { GpsModule } from '../gps/gps.module';
import { UploadsModule } from '../uploads/uploads.module';
import { HealthMonitorService } from './health-monitor.service';
import { HealthMonitorController } from './health-monitor.controller';

@Module({
  imports: [GpsModule, UploadsModule],
  controllers: [HealthMonitorController],
  providers: [HealthMonitorService],
})
export class HealthMonitorModule {}
