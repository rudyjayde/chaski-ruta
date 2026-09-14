import { Controller, ForbiddenException, Get, Query, UseGuards } from '@nestjs/common';
import { GpsService } from './gps.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { resolveOrgId } from '../common/tenant';
import { PrismaService } from '../prisma/prisma.service';

// Mapa en vivo de flota (GPS PRO / GPS Vehicular, plan-gps-vehicular.md).
//
// Correccion (11 sept 2026): antes esto rechazaba con 403 a CUALQUIER
// asociacion en plan Operacion, incluso para ver sus propias unidades con GPS
// Vehicular individual (traccarDeviceId propio) -- rompia por completo la
// pantalla de Flota para las 2 de cada 3 asociaciones reales que hoy estan en
// Operacion (confirmado en vivo: GET /gps/devices devolvia 403 y tumbaba el
// Promise.all de FleetPage.tsx). Eso sigue igual para /gps/devices (solo
// dice si esta vinculado y si esta en linea -- ninguna coordenada real).
//
// Pero /gps/live (posicion exacta) y /gps/history (recorrido real) SI son
// el dato privado de GPS Vehicular individual que se decidio (13 sept 2026)
// que el Administrador nunca ve salvo que su asociacion sea PRO -- ver el
// parametro adminRequiresPro de myVehicleIds abajo.
@Controller('gps')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GpsController {
  constructor(
    private gps: GpsService,
    private prisma: PrismaService,
  ) {}

  // Vehiculo(s) visibles para el usuario actual. null = sin restriccion
  // (ve toda la flota de la asociacion); array (incluso vacio) = acotado a
  // esos IDs exactos.
  //
  // SUPERADMIN: null siempre, sin excepcion -- ya es la regla acordada con
  // Jayde (ve IMEIs y GPS reales de cualquier asociacion, sea cual sea su
  // plan, para poder atender emergencias de seguridad).
  //
  // ADMINISTRADOR: ve todo (null) salvo que adminRequiresPro=true Y su
  // asociacion no sea PRO -- ahi [] (usado solo en /gps/live y /gps/history,
  // el dato privado de ubicacion/recorrido real; /gps/devices, que solo dice
  // vinculado/en linea sin coordenadas, sigue sin esta restriccion para no
  // repetir el bug de FleetPage del 11 sept).
  //
  // SOCIO / CONDUCTOR: solo su(s) propia(s) unidad(es), y ademas -- si la
  // asociacion no es PRO -- solo si esa unidad tiene el Plan GPS Vehicular
  // individual ACTIVO ahora mismo (gpsVehicularActivo, el interruptor real
  // que Super Admin prende/apaga segun si el socio pago el servicio).
  private async myVehicleIds(
    user: JwtPayload,
    orgId: string,
    opts: { adminRequiresPro?: boolean } = {},
  ): Promise<string[] | null> {
    if (user.role === 'SUPERADMIN') return null;
    const org = await this.prisma.organization.findUnique({ where: { id: orgId }, select: { plan: true } });
    const isPro = org?.plan === 'PRO';
    if (user.role === 'ADMINISTRADOR') return opts.adminRequiresPro && !isPro ? [] : null;
    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        organizationId: orgId,
        OR: [{ partnerId: user.sub }, { currentDriverId: user.sub }],
        ...(isPro ? {} : { gpsVehicularActivo: true }),
      },
      select: { id: true },
    });
    return vehicles.map((v) => v.id);
  }

  @Get('live')
  @Roles('ADMINISTRADOR', 'SUPERADMIN', 'SOCIO', 'CONDUCTOR')
  async live(@CurrentUser() user: JwtPayload, @Query('organizationId') organizationId?: string) {
    const orgId = resolveOrgId(user, organizationId);
    const positions = await this.gps.getLivePositions(orgId);
    const mine = await this.myVehicleIds(user, orgId, { adminRequiresPro: true });
    return mine ? positions.filter((p) => mine.includes(p.vehicleId)) : positions;
  }

  // Pantalla "Dispositivos GPS" del admin -- solo lectura (registrar/editar el
  // dispositivo sigue siendo exclusivo de Super Admin, ver vehicles.controller.ts).
  // Socio/Conductor tambien la usan (acotada a su propia unidad) para saber si
  // su vehiculo ya tiene GPS Vehicular vinculado.
  @Get('devices')
  @Roles('ADMINISTRADOR', 'SUPERADMIN', 'SOCIO', 'CONDUCTOR')
  async devices(@CurrentUser() user: JwtPayload, @Query('organizationId') organizationId?: string) {
    const orgId = resolveOrgId(user, organizationId);
    const statuses = await this.gps.getDeviceStatuses(orgId);
    const mine = await this.myVehicleIds(user, orgId);
    return mine ? statuses.filter((s) => mine.includes(s.vehicleId)) : statuses;
  }

  // Pantalla "Historial GPS" -- serie de fixes reales de UNA unidad entre dos
  // fechas. Socio/Conductor solo pueden pedir el historial de su PROPIA unidad.
  @Get('history')
  @Roles('ADMINISTRADOR', 'SUPERADMIN', 'SOCIO', 'CONDUCTOR')
  async history(
    @CurrentUser() user: JwtPayload,
    @Query('vehicleId') vehicleId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('organizationId') organizationId?: string,
  ) {
    const orgId = resolveOrgId(user, organizationId);
    const mine = await this.myVehicleIds(user, orgId, { adminRequiresPro: true });
    if (mine && !mine.includes(vehicleId)) {
      throw new ForbiddenException('Esa unidad no te pertenece.');
    }
    return this.gps.getPositionHistory(orgId, vehicleId, from, to);
  }
}
