import { Module } from '@nestjs/common';
import { GpsModule } from '../gps/gps.module';
import { RouteGeofenceModule } from '../route-geofence/route-geofence.module';
import { MailModule } from '../mail/mail.module';
import { GpsAlertsService } from './gps-alerts.service';
import { GpsAlertsController } from './gps-alerts.controller';

// Alertas GPS automaticas (docs/planes/ia-aplicada.md §1): deteccion por cron
// (GpsAlertsService) + pantalla de revision del administrador (controller).
// PrismaModule es @Global(), no hace falta importarlo.
@Module({
  imports: [GpsModule, RouteGeofenceModule, MailModule],
  controllers: [GpsAlertsController],
  providers: [GpsAlertsService],
})
export class GpsAlertsModule {}
