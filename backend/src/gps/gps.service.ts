import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

// Cliente de la API REST de Traccar (docs/planes/plan-gps-vehicular.md):
// Teltonika FMC130 -> red movil/SIM -> servidor Traccar -> este backend.
// Traccar acepta HTTP Basic Auth directo en cada llamada (sin manejar sesion
// ni cookies), usando el email/password de una cuenta de Traccar con acceso de
// lectura a los dispositivos.
interface TraccarDevice {
  id: number;
  uniqueId: string;
  name: string;
  status: string; // 'online' | 'offline' | 'unknown'
}

interface TraccarPosition {
  deviceId: number;
  latitude: number;
  longitude: number;
  speed: number; // nudos (Traccar siempre reporta velocidad en nudos)
  course: number;
  fixTime: string;
}

// Fila de la pantalla "Dispositivos GPS" del admin (solo lectura, plan-gps-vehicular.md):
// a diferencia de getLivePositions(), incluye TODAS las unidades de la asociacion --
// tengan o no dispositivo vinculado, tengan o no fix de posicion -- para que el
// admin vea el estado real de su flota, no solo las que ya reportan.
export interface VehicleGpsStatus {
  vehicleId: string;
  code: string;
  plate: string;
  companyName: string;
  traccarDeviceId: string | null;
  linked: boolean;
  // null = sin dispositivo vinculado. 'unknown' = vinculado pero Traccar aun no
  // lo reconoce (uniqueId mal copiado, o recien configurado).
  online: 'online' | 'offline' | 'unknown' | null;
  lastUpdate: string | null;
}

export interface LiveVehiclePosition {
  vehicleId: string;
  code: string;
  companyName: string;
  lat: number;
  lng: number;
  speedKmh: number;
  course: number;
  lastUpdate: string;
  // La direccion de ruta NO viene del GPS -- el GPS solo da lat/lng. Viene del
  // viaje ACTIVO de la unidad en CHASKI RUTA (dato de negocio, no de telemetria).
  route: 'JULI_PUNO' | 'PUNO_JULI' | null;
  traccarStatus: string;
}

@Injectable()
export class GpsService {
  private baseUrl: string | null = null;
  private authHeader: string | null = null;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    const url = this.config.get<string>('TRACCAR_API_URL');
    const email = this.config.get<string>('TRACCAR_EMAIL');
    const password = this.config.get<string>('TRACCAR_PASSWORD');
    if (url && email && password) {
      this.baseUrl = url.replace(/\/+$/, '');
      this.authHeader = 'Basic ' + Buffer.from(`${email}:${password}`).toString('base64');
    }
  }

  private async traccarFetch<T>(path: string): Promise<T> {
    if (!this.baseUrl || !this.authHeader) {
      throw new InternalServerErrorException(
        'El servidor Traccar no esta configurado. Agrega TRACCAR_API_URL, TRACCAR_EMAIL y TRACCAR_PASSWORD en backend/.env y reinicia el servidor.',
      );
    }
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { Authorization: this.authHeader, Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new InternalServerErrorException(`El servidor Traccar respondio ${res.status} al consultar ${path}. Revisa la URL y las credenciales en backend/.env.`);
    }
    return (await res.json()) as T;
  }

  /**
   * Posiciones en vivo de las unidades de esta asociacion que ya tienen un
   * dispositivo Traccar vinculado (Vehicle.traccarDeviceId). Nunca devuelve una
   * unidad sin fix de posicion real -- regla dura del producto (plan-operacion.md
   * #2): nunca mostrar coordenadas como si vinieran de un rastreador real, sin serlo.
   */
  async getLivePositions(organizationId: string): Promise<LiveVehiclePosition[]> {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { organizationId, traccarDeviceId: { not: null } },
      include: { company: true },
    });
    if (vehicles.length === 0) return [];

    const [devices, positions] = await Promise.all([
      this.traccarFetch<TraccarDevice[]>('/api/devices'),
      this.traccarFetch<TraccarPosition[]>('/api/positions'),
    ]);

    const deviceByUniqueId = new Map(devices.map((d) => [d.uniqueId, d]));
    const positionByDeviceId = new Map(positions.map((p) => [p.deviceId, p]));

    const activeTrips = await this.prisma.trip.findMany({
      where: { organizationId, vehicleId: { in: vehicles.map((v) => v.id) }, status: 'ACTIVO' },
    });
    const routeByVehicleId = new Map(activeTrips.map((t) => [t.vehicleId, t.route as 'JULI_PUNO' | 'PUNO_JULI']));

    const results: LiveVehiclePosition[] = [];
    for (const v of vehicles) {
      const device = v.traccarDeviceId ? deviceByUniqueId.get(v.traccarDeviceId) : undefined;
      if (!device) continue; // dispositivo configurado pero Traccar todavia no lo reconoce
      const pos = positionByDeviceId.get(device.id);
      if (!pos) continue; // sin fix de posicion aun

      results.push({
        vehicleId: v.id,
        code: v.code,
        companyName: v.company.name,
        lat: pos.latitude,
        lng: pos.longitude,
        speedKmh: Math.round((pos.speed || 0) * 1.852),
        course: pos.course,
        lastUpdate: pos.fixTime,
        route: routeByVehicleId.get(v.id) ?? null,
        traccarStatus: device.status,
      });
    }
    return results;
  }

  /**
   * Posicion actual de UNA sola unidad (GPS real del vehiculo, via Traccar) --
   * usado por "Marcar llegada" en Plan PRO (plan-flujo-colas-hardware.md §2.6),
   * donde el conductor no hace nada adicional: el backend lee la posicion del
   * hardware directamente. Devuelve null si la unidad no tiene dispositivo
   * vinculado o si Traccar todavia no reporta un fix para ella.
   */
  async getVehiclePosition(organizationId: string, vehicleId: string): Promise<{ lat: number; lng: number; fixTime: string } | null> {
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id: vehicleId, organizationId } });
    if (!vehicle?.traccarDeviceId) return null;

    const [devices, positions] = await Promise.all([
      this.traccarFetch<TraccarDevice[]>('/api/devices'),
      this.traccarFetch<TraccarPosition[]>('/api/positions'),
    ]);
    const device = devices.find((d) => d.uniqueId === vehicle.traccarDeviceId);
    if (!device) return null;
    const pos = positions.find((p) => p.deviceId === device.id);
    if (!pos) return null;
    return { lat: pos.latitude, lng: pos.longitude, fixTime: pos.fixTime };
  }

  /**
   * Estado de vinculacion GPS de TODAS las unidades de la asociacion (vinculadas
   * o no) -- para la pantalla de solo lectura "Dispositivos GPS" del admin. El
   * registrar/editar el dispositivo sigue siendo exclusivo de Super Admin en
   * Flota -> GPS; esto es solo consulta.
   */
  async getDeviceStatuses(organizationId: string): Promise<VehicleGpsStatus[]> {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { organizationId },
      include: { company: true },
      orderBy: { code: 'asc' },
    });
    if (vehicles.length === 0) return [];

    const anyLinked = vehicles.some((v) => v.traccarDeviceId);
    let deviceByUniqueId = new Map<string, TraccarDevice>();
    let positionByDeviceId = new Map<number, TraccarPosition>();
    if (anyLinked) {
      const [devices, positions] = await Promise.all([
        this.traccarFetch<TraccarDevice[]>('/api/devices'),
        this.traccarFetch<TraccarPosition[]>('/api/positions'),
      ]);
      deviceByUniqueId = new Map(devices.map((d) => [d.uniqueId, d]));
      positionByDeviceId = new Map(positions.map((p) => [p.deviceId, p]));
    }

    return vehicles.map((v) => {
      if (!v.traccarDeviceId) {
        return {
          vehicleId: v.id, code: v.code, plate: v.plate, companyName: v.company.name,
          traccarDeviceId: null, linked: false, online: null, lastUpdate: null,
        };
      }
      const device = deviceByUniqueId.get(v.traccarDeviceId);
      const pos = device ? positionByDeviceId.get(device.id) : undefined;
      return {
        vehicleId: v.id, code: v.code, plate: v.plate, companyName: v.company.name,
        traccarDeviceId: v.traccarDeviceId, linked: true,
        online: (device?.status as 'online' | 'offline' | 'unknown' | undefined) ?? 'unknown',
        lastUpdate: pos?.fixTime ?? null,
      };
    });
  }
}
