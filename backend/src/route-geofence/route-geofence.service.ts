import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/jwt.strategy';

export interface GeofencePoint {
  lat: number;
  lng: number;
}

const MIN_POINTS = 3;

@Injectable()
export class RouteGeofenceService {
  constructor(private prisma: PrismaService) {}

  async get(organizationId: string) {
    return this.prisma.routeGeofence.findUnique({ where: { organizationId } });
  }

  /**
   * Guarda (o reemplaza) el corredor autorizado -- SIEMPRE dibujado a mano
   * por un administrador, nunca generado por el sistema a partir de una
   * linea recta entre terminales (ver comentario en schema.prisma).
   */
  async save(organizationId: string, actor: JwtPayload, points: GeofencePoint[]) {
    if (!Array.isArray(points) || points.length < MIN_POINTS) {
      throw new BadRequestException(`El corredor necesita al menos ${MIN_POINTS} puntos.`);
    }
    for (const p of points) {
      if (typeof p.lat !== 'number' || typeof p.lng !== 'number') {
        throw new BadRequestException('Cada punto del corredor necesita lat y lng numéricos.');
      }
    }

    const before = await this.prisma.routeGeofence.findUnique({ where: { organizationId } });
    const pointsJson = points as unknown as Prisma.InputJsonValue;
    const updated = await this.prisma.routeGeofence.upsert({
      where: { organizationId },
      create: { organizationId, points: pointsJson, updatedById: actor.sub },
      update: { points: pointsJson, updatedById: actor.sub },
    });

    await this.prisma.auditEntry.create({
      data: {
        organizationId,
        actorId: actor.sub,
        actorRole: actor.role,
        action: before ? 'ACTUALIZAR_CORREDOR_GEOCERCA' : 'CREAR_CORREDOR_GEOCERCA',
        resource: 'Corredor autorizado',
        resourceId: updated.id,
        before: before ? `${(before.points as unknown as GeofencePoint[]).length} puntos` : 'Sin corredor',
        after: `${points.length} puntos`,
      },
    });

    return updated;
  }

  /**
   * Ray casting estandar (algoritmo de geometria computacional de libro de
   * texto, no inventado) -- true si el punto cae dentro del poligono.
   */
  static isInside(point: GeofencePoint, polygon: GeofencePoint[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].lng, yi = polygon[i].lat;
      const xj = polygon[j].lng, yj = polygon[j].lat;
      const intersects = yi > point.lat !== yj > point.lat &&
        point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
      if (intersects) inside = !inside;
    }
    return inside;
  }
}
