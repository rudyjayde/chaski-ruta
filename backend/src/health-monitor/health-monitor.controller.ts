import { Controller, Get, UseGuards } from '@nestjs/common';
import { HealthMonitorService } from './health-monitor.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

// Salud tecnica REAL de la infraestructura de CHASKI AI -- solo Super Admin,
// no es informacion de ninguna asociacion en particular (ver
// health-monitor.service.ts).
@Controller('health-monitor')
@UseGuards(JwtAuthGuard, RolesGuard)
export class HealthMonitorController {
  constructor(private healthMonitor: HealthMonitorService) {}

  @Get()
  @Roles('SUPERADMIN')
  getStatus() {
    return this.healthMonitor.getStatus();
  }
}
