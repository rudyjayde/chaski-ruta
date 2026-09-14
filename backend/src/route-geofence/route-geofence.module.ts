import { Module } from '@nestjs/common';
import { RouteGeofenceService } from './route-geofence.service';
import { RouteGeofenceController } from './route-geofence.controller';

@Module({
  controllers: [RouteGeofenceController],
  providers: [RouteGeofenceService],
  exports: [RouteGeofenceService],
})
export class RouteGeofenceModule {}
