import { Module } from '@nestjs/common';
import { GpsModule } from '../gps/gps.module';
import { OperationalConfigModule } from '../operational-config/operational-config.module';
import { RouteRiskService } from './route-risk.service';
import { RouteRiskController } from './route-risk.controller';

@Module({
  imports: [GpsModule, OperationalConfigModule],
  controllers: [RouteRiskController],
  providers: [RouteRiskService],
})
export class RouteRiskModule {}
