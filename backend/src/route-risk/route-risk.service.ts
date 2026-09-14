import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GpsService } from '../gps/gps.service';
import { OperationalConfigService } from '../operational-config/operational-config.service';

// Mapa de riesgo de ruta -- version basica de una sola asociacion
// (docs/planes/ia-aplicada.md §3.2). Jayde confirmo construirlo igual (9 sept
// 2026) aunque el documento advierte que no tiene mucho sentido todavia con
// una sola flota chica -- por eso esto es deliberadamente simple: se calcula
// AL VUELO cuando alguien abre la pantalla, agregando el historial de
// Traccar de cada unidad con hardware vinculado, sin tabla nueva ni cron
// propio. Ventajas de esto: no requiere migracion de base de datos, y el
// resultado siempre refleja el historial que Traccar todavia conserve (la
// ventana real disponible depende de la retencion configurada en el
// servidor Traccar, algo que este backend no controla ni puede alargar).
//
// Mismos 2 tipos de evento que ya usa la deteccion de accidentes
// (accident-detection.service.ts), MISMA honestidad: son patrones de
// velocidad/posicion, no lecturas de un sensor de impacto real.
//  - FRENADA_BRUSCA: velocidad alta seguida de velocidad casi nula en menos
//    de HARSH_BRAKE_MAX_GAP_MINUTES entre dos fixes consecutivos.
//  - PARADA_ANOMALA: el vehiculo quedo inmovil por STOP_MIN_MINUTES o mas,
//    en un punto que NO esta cerca de ninguno de los 2 terminales (una
//    parada junto al terminal es simplemente el vehiculo esperando su turno,
//    no un punto de riesgo de la via).
const HARSH_BRAKE_FROM_KMH = 35;
const HARSH_BRAKE_TO_KMH = 8;
const HARSH_BRAKE_MAX_GAP_MINUTES = 2;
const STOP_SPEED_KMH = 3;
const STOP_MIN_MINUTES = 5;
const TERMINAL_BUFFER_METERS = 800;
// Tamano de celda de la grilla para agrupar eventos cercanos en un mismo
// "punto de riesgo" -- 3 decimales de grado ≈ 111m en el ecuador (menos en
// latitudes altas, pero suficiente para un corredor de montana como este).
const GRID_DECIMALS = 3;
const MAX_POINTS_RETURNED = 60;

interface PositionFix {
  lat: number;
  lng: number;
  speedKmh: number;
  fixTime: string;
}

interface RiskEvent {
  lat: number;
  lng: number;
  type: 'FRENADA_BRUSCA' | 'PARADA_ANOMALA';
  fixTime: string;
}

export interface RiskPoint {
  lat: number;
  lng: number;
  totalEvents: number;
  harshBrakingCount: number;
  anomalousStopCount: number;
  lastSeen: string;
}

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

@Injectable()
export class RouteRiskService {
  constructor(
    private prisma: PrismaService,
    private gps: GpsService,
    private operationalConfig: OperationalConfigService,
  ) {}

  async getRiskPoints(
    organizationId: string,
    days: number,
  ): Promise<{ points: RiskPoint[]; vehiclesAnalyzed: number; windowDays: number }> {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { organizationId, traccarDeviceId: { not: null } },
    });
    if (vehicles.length === 0) {
      return { points: [], vehiclesAnalyzed: 0, windowDays: days };
    }

    const config = await this.operationalConfig.getOrCreate(organizationId);
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60_000);

    const events: RiskEvent[] = [];
    for (const vehicle of vehicles) {
      const history = await this.gps
        .getPositionHistory(organizationId, vehicle.id, from.toISOString(), to.toISOString())
        .catch(() => [] as PositionFix[]);
      events.push(...this.detectEvents(history, config));
    }

    return {
      points: this.aggregateGrid(events),
      vehiclesAnalyzed: vehicles.length,
      windowDays: days,
    };
  }

  private detectEvents(
    history: PositionFix[],
    config: { terminalOriginLat: number; terminalOriginLng: number; terminalDestinationLat: number; terminalDestinationLng: number },
  ): RiskEvent[] {
    const events: RiskEvent[] = [];

    // Frenadas bruscas: comparar cada par de fixes consecutivos.
    for (let i = 1; i < history.length; i++) {
      const prev = history[i - 1];
      const curr = history[i];
      const gapMinutes = (new Date(curr.fixTime).getTime() - new Date(prev.fixTime).getTime()) / 60_000;
      if (gapMinutes <= 0 || gapMinutes > HARSH_BRAKE_MAX_GAP_MINUTES) continue;
      if (prev.speedKmh >= HARSH_BRAKE_FROM_KMH && curr.speedKmh <= HARSH_BRAKE_TO_KMH) {
        events.push({ lat: curr.lat, lng: curr.lng, type: 'FRENADA_BRUSCA', fixTime: curr.fixTime });
      }
    }

    // Paradas anomalas: tramos continuos de velocidad casi nula.
    let stopStartIndex: number | null = null;
    for (let i = 0; i < history.length; i++) {
      const isStopped = history[i].speedKmh <= STOP_SPEED_KMH;
      if (isStopped && stopStartIndex === null) stopStartIndex = i;
      const isLast = i === history.length - 1;
      if ((!isStopped || isLast) && stopStartIndex !== null) {
        const endIndex = isStopped && isLast ? i : i - 1;
        const durationMinutes =
          (new Date(history[endIndex].fixTime).getTime() - new Date(history[stopStartIndex].fixTime).getTime()) / 60_000;
        if (durationMinutes >= STOP_MIN_MINUTES) {
          const point = history[stopStartIndex];
          const distOrigin = distanceMeters(point.lat, point.lng, config.terminalOriginLat, config.terminalOriginLng);
          const distDest = distanceMeters(point.lat, point.lng, config.terminalDestinationLat, config.terminalDestinationLng);
          if (distOrigin > TERMINAL_BUFFER_METERS && distDest > TERMINAL_BUFFER_METERS) {
            events.push({ lat: point.lat, lng: point.lng, type: 'PARADA_ANOMALA', fixTime: point.fixTime });
          }
        }
        stopStartIndex = null;
      }
    }

    return events;
  }

  private aggregateGrid(events: RiskEvent[]): RiskPoint[] {
    const cells = new Map<
      string,
      { sumLat: number; sumLng: number; count: number; harsh: number; stop: number; lastSeen: string }
    >();

    for (const e of events) {
      const key = `${e.lat.toFixed(GRID_DECIMALS)}:${e.lng.toFixed(GRID_DECIMALS)}`;
      let cell = cells.get(key);
      if (!cell) {
        cell = { sumLat: 0, sumLng: 0, count: 0, harsh: 0, stop: 0, lastSeen: e.fixTime };
        cells.set(key, cell);
      }
      cell.sumLat += e.lat;
      cell.sumLng += e.lng;
      cell.count += 1;
      if (e.type === 'FRENADA_BRUSCA') cell.harsh += 1;
      else cell.stop += 1;
      if (new Date(e.fixTime).getTime() > new Date(cell.lastSeen).getTime()) cell.lastSeen = e.fixTime;
    }

    const points: RiskPoint[] = Array.from(cells.values()).map((c) => ({
      lat: c.sumLat / c.count,
      lng: c.sumLng / c.count,
      totalEvents: c.harsh + c.stop,
      harshBrakingCount: c.harsh,
      anomalousStopCount: c.stop,
      lastSeen: c.lastSeen,
    }));

    points.sort((a, b) => b.totalEvents - a.totalEvents);
    return points.slice(0, MAX_POINTS_RETURNED);
  }
}
