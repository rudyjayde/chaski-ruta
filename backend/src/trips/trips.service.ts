import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GpsService } from '../gps/gps.service';
import { JwtPayload } from '../auth/jwt.strategy';
import { AlertTripDto } from './dto/alert-trip.dto';
import { CompleteTripDto } from './dto/complete-trip.dto';
import { ResolveIncidentDto } from './dto/resolve-incident.dto';

@Injectable()
export class TripsService {
  constructor(
    private prisma: PrismaService,
    private gps: GpsService,
  ) {}

  findMany(organizationId: string, route?: string, status?: string) {
    return this.prisma.trip.findMany({
      where: {
        organizationId,
        ...(route ? { route: route as any } : {}),
        ...(status ? { status: status as any } : {}),
      },
      include: { vehicle: true, driver: true, manifest: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async findOwnedTrip(organizationId: string, actor: JwtPayload, id: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id } });
    if (!trip || trip.organizationId !== organizationId) {
      throw new NotFoundException('Viaje no encontrado');
    }
    if (actor.role === 'CONDUCTOR' && trip.driverId !== actor.sub) {
      throw new ForbiddenException('No es tu viaje');
    }
    return trip;
  }

  async findOne(organizationId: string, actor: JwtPayload, id: string) {
    return this.findOwnedTrip(organizationId, actor, id);
  }

  /**
   * "Marcar llegada" (plan-flujo-colas-hardware.md §2.6) -- mismo boton para
   * Plan Operacion y Plan PRO, solo cambia de donde sale la posicion:
   *  - Con hardware Traccar vinculado a esta unidad (Plan PRO real, no solo
   *    contratado): lee la posicion real del vehiculo, sin pedirle nada mas
   *    al conductor -- Trip.gpsStatus queda en GPS_FISICO.
   *  - Si no hay hardware vinculado en esta unidad (Operacion, o PRO
   *    contratado pero sin instalar todavia en esta unidad): exige lat/lng
   *    del celular del conductor (chequeo puntual, nunca rastreo continuo) --
   *    Trip.gpsStatus queda en REGISTRO_MOVIL.
   *  - Completar sin ninguna de las dos (solo administrador/superadmin, caso
   *    de excepcion -- incidencia, celular perdido, etc.) deja SIN_GPS, sin
   *    evidencia, igual que hoy.
   */
  async complete(organizationId: string, actor: JwtPayload, id: string, dto?: CompleteTripDto) {
    const trip = await this.findOwnedTrip(organizationId, actor, id);
    if (trip.status !== 'ACTIVO') {
      throw new BadRequestException('Solo un viaje activo se puede completar');
    }

    let gpsStatus: 'SIN_GPS' | 'REGISTRO_MOVIL' | 'GPS_FISICO' = 'SIN_GPS';
    const hardwarePosition = await this.gps.getVehiclePosition(organizationId, trip.vehicleId).catch(() => null);
    if (hardwarePosition) {
      gpsStatus = 'GPS_FISICO';
    } else if (dto?.lat !== undefined && dto?.lng !== undefined) {
      gpsStatus = 'REGISTRO_MOVIL';
    } else if (actor.role === 'CONDUCTOR') {
      throw new BadRequestException(
        'Falta la ubicacion del celular para confirmar la llegada. Revisa los permisos de ubicacion del navegador.',
      );
    }

    const updated = await this.prisma.trip.update({
      where: { id },
      data: { status: 'COMPLETADO', actualArrival: new Date(), gpsStatus },
    });
    await this.prisma.auditEntry.create({
      data: {
        organizationId,
        actorId: actor.sub,
        actorRole: actor.role,
        action: 'COMPLETAR_VIAJE',
        resource: 'Viaje',
        resourceId: id,
        before: trip.status,
        after: 'COMPLETADO',
        evidence: gpsStatus,
      },
    });
    return updated;
  }

  /**
   * Boton de alerta del conductor (§3.7): no crea un estado nuevo del sistema —
   * reusa CON_INCIDENCIA + la nota, y lo que sigue es siempre resolucion manual
   * del gerente (resolveIncident), nunca automatico.
   */
  async alert(organizationId: string, actor: JwtPayload, id: string, dto: AlertTripDto) {
    const trip = await this.findOwnedTrip(organizationId, actor, id);
    const updated = await this.prisma.trip.update({
      where: { id },
      data: { status: 'CON_INCIDENCIA', incidentNote: dto.note },
    });
    await this.prisma.auditEntry.create({
      data: {
        organizationId,
        actorId: actor.sub,
        actorRole: actor.role,
        action: 'ALERTA_CONDUCTOR',
        resource: 'Viaje',
        resourceId: id,
        before: trip.status,
        after: 'CON_INCIDENCIA',
        reason: dto.note,
      },
    });
    return updated;
  }

  async resolveIncident(organizationId: string, actor: JwtPayload, id: string, dto: ResolveIncidentDto) {
    const trip = await this.prisma.trip.findUnique({ where: { id } });
    if (!trip || trip.organizationId !== organizationId) {
      throw new NotFoundException('Viaje no encontrado');
    }
    if (trip.status !== 'CON_INCIDENCIA') {
      throw new BadRequestException('Este viaje no tiene una incidencia activa');
    }
    const updated = await this.prisma.trip.update({
      where: { id },
      data: {
        status: dto.resolution,
        actualArrival: dto.resolution === 'COMPLETADO' ? new Date() : trip.actualArrival,
      },
    });
    await this.prisma.auditEntry.create({
      data: {
        organizationId,
        actorId: actor.sub,
        actorRole: actor.role,
        action: 'RESOLVER_INCIDENCIA',
        resource: 'Viaje',
        resourceId: id,
        before: 'CON_INCIDENCIA',
        after: dto.resolution,
        reason: dto.reason,
      },
    });
    return updated;
  }
}
