import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GpsService } from '../gps/gps.service';
import { RouteDir } from '@prisma/client';

const DEFAULT_WINDOW_DAYS = 30;
// Misma definicion de frenada brusca que route-risk.service.ts (velocidad
// alta a casi nula en pocos minutos) -- se duplica aqui a proposito porque
// esta si se atribuye a UN conductor (via el viaje activo), mientras que
// route-risk la agrupa por punto del mapa, no por persona. Mismo criterio de
// honestidad: patron de velocidad real, no un sensor de frenado.
const HARSH_BRAKE_FROM_KMH = 35;
const HARSH_BRAKE_TO_KMH = 8;
const HARSH_BRAKE_MAX_GAP_MINUTES = 2;
const ROUTES: RouteDir[] = ['JULI_PUNO', 'PUNO_JULI'];
// Cola "activa" = todavia no salio ni se retiro. Se usa tanto para el conteo
// en vivo como para saber si un registro historico realmente representaba
// una unidad esperando (no se filtra por status en el historico porque lo
// que importa ahi es CUANDO se inscribio, no en que quedo despues).
const ACTIVE_QUEUE_STATUSES = ['PREINSCRITO', 'INSCRITO', 'LLAMADO', 'EN_TERMINAL', 'EMBARCANDO', 'LISTO'] as const;

export interface HourlyQueueTerminal {
  route: RouteDir;
  currentCount: number;
  historicalAverageThisHour: number;
}

export interface HourlyQueuePattern {
  hour: number;
  windowDays: number;
  terminals: HourlyQueueTerminal[];
  // Sugerencia PURAMENTE descriptiva (plan-pro.md §11.3): nunca se ejecuta
  // sola, el administrador sigue eligiendo manualmente que unidades mover.
  // `units` es la mitad de la diferencia actual entre terminales, redondeada
  // hacia abajo -- un calculo simple y transparente, no un algoritmo oculto.
  suggestedRelocation: { from: RouteDir; to: RouteDir; units: number } | null;
}

export interface TurnaroundByCompany {
  companyId: string;
  companyName: string;
  tripCount: number;
  averageMinutes: number;
}

export interface TurnaroundEfficiency {
  windowDays: number;
  corridorAverageMinutes: number | null;
  companies: TurnaroundByCompany[];
}

export interface DriverEventCount {
  driverId: string;
  driverName: string;
  harshBrakingCount: number;
}

export interface DrivingEventsResult {
  windowDays: number;
  drivers: DriverEventCount[];
}

@Injectable()
export class FleetReportsService {
  constructor(
    private prisma: PrismaService,
    private gps: GpsService,
  ) {}

  /**
   * 11.3 Sugerencia de reubicación (plan-pro.md, PENDIENTE DE DECISIÓN hasta
   * el 12 sept 2026): compara la cola actual de cada terminal contra el
   * promedio histórico REAL de esa hora del día, calculado sobre las
   * inscripciones reales de los últimos `days` días -- nunca un umbral
   * inventado, solo el patrón real de esta asociación.
   */
  async getHourlyQueuePattern(organizationId: string, days = DEFAULT_WINDOW_DAYS): Promise<HourlyQueuePattern> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const historical = await this.prisma.queueEntry.findMany({
      where: { organizationId, registeredAt: { gte: since } },
      select: { route: true, registeredAt: true },
    });

    const currentHour = new Date().getHours();
    const countThisHourByRoute: Record<string, number> = { JULI_PUNO: 0, PUNO_JULI: 0 };
    for (const e of historical) {
      if (e.registeredAt.getHours() === currentHour) {
        countThisHourByRoute[e.route] = (countThisHourByRoute[e.route] ?? 0) + 1;
      }
    }

    const currentCounts = await this.prisma.queueEntry.groupBy({
      by: ['route'],
      where: { organizationId, status: { in: [...ACTIVE_QUEUE_STATUSES] } },
      _count: { _all: true },
    });
    const currentByRoute: Record<string, number> = { JULI_PUNO: 0, PUNO_JULI: 0 };
    for (const c of currentCounts) currentByRoute[c.route] = c._count._all;

    const terminals: HourlyQueueTerminal[] = ROUTES.map((route) => ({
      route,
      currentCount: currentByRoute[route] ?? 0,
      historicalAverageThisHour: Math.round(((countThisHourByRoute[route] ?? 0) / days) * 10) / 10,
    }));

    const [a, b] = terminals;
    let suggestedRelocation: HourlyQueuePattern['suggestedRelocation'] = null;
    if (a.currentCount > a.historicalAverageThisHour + 1 && b.currentCount < b.historicalAverageThisHour) {
      const units = Math.floor((a.currentCount - b.currentCount) / 2);
      if (units >= 1) suggestedRelocation = { from: a.route, to: b.route, units };
    } else if (b.currentCount > b.historicalAverageThisHour + 1 && a.currentCount < a.historicalAverageThisHour) {
      const units = Math.floor((b.currentCount - a.currentCount) / 2);
      if (units >= 1) suggestedRelocation = { from: b.route, to: a.route, units };
    }

    return { hour: currentHour, windowDays: days, terminals, suggestedRelocation };
  }

  /**
   * 11.4 Reportes de eficiencia (plan-pro.md): tiempos de vuelta REALES
   * (viajes completados con salida y llegada registradas) por empresa,
   * comparados contra el promedio del corredor -- el gerente decide que
   * hacer con esa informacion, el sistema no senala ni sanciona a nadie.
   */
  async getTurnaroundEfficiency(organizationId: string, days = DEFAULT_WINDOW_DAYS): Promise<TurnaroundEfficiency> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const trips = await this.prisma.trip.findMany({
      where: {
        organizationId,
        status: 'COMPLETADO',
        actualDeparture: { not: null, gte: since },
        actualArrival: { not: null },
      },
      select: {
        actualDeparture: true,
        actualArrival: true,
        vehicle: { select: { company: { select: { id: true, name: true } } } },
      },
    });

    if (trips.length === 0) return { windowDays: days, corridorAverageMinutes: null, companies: [] };

    const byCompany = new Map<string, { companyName: string; totalMinutes: number; count: number }>();
    let corridorTotal = 0;
    for (const t of trips) {
      const minutes = (t.actualArrival!.getTime() - t.actualDeparture!.getTime()) / 60000;
      corridorTotal += minutes;
      const key = t.vehicle.company.id;
      const cur = byCompany.get(key) ?? { companyName: t.vehicle.company.name, totalMinutes: 0, count: 0 };
      cur.totalMinutes += minutes;
      cur.count += 1;
      byCompany.set(key, cur);
    }

    const companies: TurnaroundByCompany[] = Array.from(byCompany.entries())
      .map(([companyId, v]) => ({
        companyId,
        companyName: v.companyName,
        tripCount: v.count,
        averageMinutes: Math.round(v.totalMinutes / v.count),
      }))
      .sort((x, y) => y.averageMinutes - x.averageMinutes);

    return {
      windowDays: days,
      corridorAverageMinutes: Math.round(corridorTotal / trips.length),
      companies,
    };
  }

  /**
   * 11.2 Puntaje de conducción (plan-pro.md, PENDIENTE DE DECISIÓN): esta
   * funcion SOLO cuenta eventos reales de frenada brusca por conductor --
   * deliberadamente NO calcula ningun puntaje ni ranking de "buen/mal
   * conductor" todavia, porque unas semanas de datos no alcanzan para saber
   * que es un patron normal en este corredor. Es evidencia cruda para que el
   * administrador la revise, igual que las alertas GPS -- nunca una condena.
   */
  async getDrivingEventCounts(organizationId: string, days = DEFAULT_WINDOW_DAYS): Promise<DrivingEventsResult> {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { organizationId, traccarDeviceId: { not: null } },
    });
    if (vehicles.length === 0) return { windowDays: days, drivers: [] };

    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60_000);

    const trips = await this.prisma.trip.findMany({
      where: {
        organizationId,
        vehicleId: { in: vehicles.map((v) => v.id) },
        actualDeparture: { not: null, gte: from },
      },
      select: {
        vehicleId: true,
        driverId: true,
        driver: { select: { name: true } },
        actualDeparture: true,
        actualArrival: true,
      },
    });

    const countByDriver = new Map<string, { driverName: string; harshBrakingCount: number }>();

    for (const vehicle of vehicles) {
      const history = await this.gps
        .getPositionHistory(organizationId, vehicle.id, from.toISOString(), to.toISOString())
        .catch(() => []);
      const vehicleTrips = trips.filter((t) => t.vehicleId === vehicle.id);

      for (let i = 1; i < history.length; i++) {
        const prev = history[i - 1];
        const curr = history[i];
        const gapMinutes = (new Date(curr.fixTime).getTime() - new Date(prev.fixTime).getTime()) / 60_000;
        if (gapMinutes <= 0 || gapMinutes > HARSH_BRAKE_MAX_GAP_MINUTES) continue;
        if (prev.speedKmh < HARSH_BRAKE_FROM_KMH || curr.speedKmh > HARSH_BRAKE_TO_KMH) continue;

        // Solo se atribuye a un conductor si hay un viaje real que cubra ese
        // instante -- sin eso, el evento se descarta (nunca se adivina quien iba manejando).
        const fixTimeMs = new Date(curr.fixTime).getTime();
        const trip = vehicleTrips.find(
          (t) =>
            t.actualDeparture &&
            fixTimeMs >= t.actualDeparture.getTime() &&
            (!t.actualArrival || fixTimeMs <= t.actualArrival.getTime()),
        );
        if (!trip) continue;

        const entry = countByDriver.get(trip.driverId) ?? { driverName: trip.driver.name, harshBrakingCount: 0 };
        entry.harshBrakingCount += 1;
        countByDriver.set(trip.driverId, entry);
      }
    }

    const drivers = Array.from(countByDriver.entries())
      .map(([driverId, v]) => ({ driverId, driverName: v.driverName, harshBrakingCount: v.harshBrakingCount }))
      .sort((a, b) => b.harshBrakingCount - a.harshBrakingCount);

    return { windowDays: days, drivers };
  }
}
