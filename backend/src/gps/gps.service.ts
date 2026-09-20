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
  // Ultima vez que el servidor Traccar recibio ALGO de este equipo (ISO), aunque no fuera una posicion nueva.
  lastUpdate?: string | null;
}

interface TraccarPosition {
  deviceId: number;
  latitude: number;
  longitude: number;
  speed: number; // nudos (Traccar siempre reporta velocidad en nudos)
  course: number;
  fixTime: string;
  // Traccar marca 'valid=false' cuando el equipo todavia no tenia un fix GPS
  // real (recien encendido, sin señal de satelites) -- ese registro trae
  // coordenadas basura (tipicamente cerca de 0,0, "Null Island") que NUNCA
  // se deben mostrar como si fueran la posicion real del vehiculo. Verificado
  // en vivo el 12 sept 2026: sin este filtro, el historial de ATIPCAR-001
  // mostraba un salto real de miles de km hacia el golfo de Guinea.
  valid: boolean;
  // Atributos decodificados por Traccar del protocolo Teltonika -- solo estan
  // presentes si el elemento I/O correspondiente esta habilitado en el equipo
  // (Data Acquisition / I/O del Teltonika Configurator). Verificado en vivo
  // contra ATIPCAR-001 el 12 sept 2026 tras habilitar External Voltage,
  // Battery Voltage, GSM Signal y Odometer -- nunca asumir que existen.
  attributes?: {
    ignition?: boolean;
    motion?: boolean;
    power?: number; // voltios, bateria del vehiculo (External Voltage)
    battery?: number; // voltios, bateria interna del propio equipo GPS
    rssi?: number; // calidad de señal GSM
    totalDistance?: number; // metros, acumulado por Traccar (odometro real + GPS)
    // Boton de panico (docs/planes/plan-pro.md §Botón de pánico): 'sos' es la
    // convencion estandar de Traccar para alarmas de panico/SOS de varios
    // protocolos -- SIN VERIFICAR TODAVIA contra un Teltonika real con boton
    // fisico cableado (ningun equipo de esta flota lo tiene instalado hoy).
    alarm?: string;
  };
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
  // null = el equipo todavia no reporta ese atributo (firmware sin ese I/O
  // habilitado) -- nunca se inventa un valor cuando Traccar no lo trae.
  ignition: boolean | null;
  motion: boolean | null;
  powerVoltage: number | null;
  batteryVoltage: number | null;
  signal: number | null;
  odometerKm: number | null;
  panicAlarm: boolean;
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
   * Chequeo real de salud del servidor Traccar (12 sept 2026, Salud tecnica
   * de Super Admin): pide /api/devices (autenticado, liviano) y cronometra
   * la respuesta -- confirma conectividad Y que las credenciales siguen
   * siendo validas, no solo que las variables de entorno existen.
   */
  async checkHealth(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    if (!this.baseUrl || !this.authHeader) {
      return { ok: false, latencyMs: 0, error: 'Traccar no configurado (TRACCAR_API_URL/EMAIL/PASSWORD en backend/.env)' };
    }
    try {
      await this.traccarFetch('/api/devices');
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - start, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Envia el comando estandar de Traccar para inmovilizadores --
   * 'engineStop' / 'engineResume' -- via POST /api/commands/send
   * (docs.traccar.org/api). Es la abstraccion OFICIAL de Traccar, no un
   * indice de salida digital inventado por este backend: Traccar traduce el
   * comando al protocolo real de cada dispositivo (Teltonika en este caso).
   *
   * SIN VERIFICAR TODAVIA contra un equipo real (12 sept 2026): ningun
   * vehiculo de esta flota tiene el rele de combustible/ignicion cableado a
   * una salida digital -- eso es instalacion fisica pendiente. Cuando se
   * cablee el primero, confirmar en vivo que Traccar acepta el comando para
   * este dispositivo (algunos servidores Traccar requieren habilitar
   * "Commands" por dispositivo/protocolo antes de que el envio funcione).
   */
  async sendEngineCommand(organizationId: string, vehicleId: string, action: 'stop' | 'resume'): Promise<void> {
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id: vehicleId, organizationId } });
    if (!vehicle?.traccarDeviceId) {
      throw new InternalServerErrorException('Esta unidad no tiene un dispositivo GPS real vinculado.');
    }
    const devices = await this.traccarFetch<TraccarDevice[]>('/api/devices');
    const device = devices.find((d) => d.uniqueId === vehicle.traccarDeviceId);
    if (!device) {
      throw new InternalServerErrorException('Traccar todavia no reconoce el dispositivo de esta unidad.');
    }
    if (!this.baseUrl || !this.authHeader) {
      throw new InternalServerErrorException('El servidor Traccar no esta configurado.');
    }
    const res = await fetch(`${this.baseUrl}/api/commands/send`, {
      method: 'POST',
      headers: { Authorization: this.authHeader, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ deviceId: device.id, type: action === 'stop' ? 'engineStop' : 'engineResume' }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new InternalServerErrorException(
        `Traccar respondio ${res.status} al enviar el comando ${action === 'stop' ? 'engineStop' : 'engineResume'}. ${body}`,
      );
    }
  }

  /**
   * Posiciones en vivo de las unidades de esta asociacion que ya tienen un
   * dispositivo Traccar vinculado (Vehicle.traccarDeviceId). Nunca devuelve una
   * unidad sin fix de posicion real -- regla dura del producto (plan-operacion.md
   * #2): nunca mostrar coordenadas como si vinieran de un rastreador real, sin serlo.
   */
  async getLivePositions(organizationId: string): Promise<LiveVehiclePosition[]> {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { organizationId, traccarDeviceId: { not: null }, status: { not: 'BAJA' } },
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
      if (!pos || pos.valid === false) continue; // sin fix de posicion real aun

      const attrs = pos.attributes;
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
        ignition: attrs?.ignition ?? null,
        motion: attrs?.motion ?? null,
        powerVoltage: attrs?.power ?? null,
        batteryVoltage: attrs?.battery ?? null,
        signal: attrs?.rssi ?? null,
        odometerKm: attrs?.totalDistance != null ? Math.round(attrs.totalDistance / 100) / 10 : null,
        panicAlarm: attrs?.alarm === 'sos',
      });
    }
    return results;
  }

  /**
   * Estado del GPS fisico de UNA unidad y su ultima posicion, SOLO si es reciente.
   *
   * Traccar guarda para siempre la ultima posicion que recibio: si el equipo se malogra o lo
   * desconectan, esa posicion sigue ahi, cada vez mas vieja. Tomarla como "donde esta ahora"
   * rechaza al conductor con un mensaje falso (esta lejos de donde quedo el equipo) o deja
   * inscribir a quien se fue lejos con el equipo desconectado. Por eso la posicion solo cuenta
   * si la ultima señal (posicion o cualquier contacto del equipo) es mas nueva que
   * OperationalConfig.gpsMaxAgeMinutes.
   *
   *  - linked: la unidad tiene un equipo Traccar vinculado.
   *  - position: posicion valida y reciente; null si no hay o esta vencida.
   *  - noSignal: linked pero sin posicion reciente (equipo malogrado, desconectado, sin fix
   *    de satelites, o servidor Traccar inalcanzable -- en ese caso no se puede verificar nada).
   */
  async getVehicleHardwareStatus(
    organizationId: string,
    vehicleId: string,
    now: Date = new Date(),
  ): Promise<{ linked: boolean; noSignal: boolean; position: { lat: number; lng: number; fixTime: string } | null }> {
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id: vehicleId, organizationId } });
    if (!vehicle?.traccarDeviceId) return { linked: false, noSignal: false, position: null };

    const config = await this.prisma.operationalConfig.findUnique({ where: { organizationId }, select: { gpsMaxAgeMinutes: true } });
    const maxAgeMs = (config?.gpsMaxAgeMinutes ?? 5) * 60_000;

    try {
      const [devices, positions] = await Promise.all([
        this.traccarFetch<TraccarDevice[]>('/api/devices'),
        this.traccarFetch<TraccarPosition[]>('/api/positions'),
      ]);
      const device = devices.find((d) => d.uniqueId === vehicle.traccarDeviceId);
      const pos = device ? positions.find((p) => p.deviceId === device.id) : undefined;
      if (!device || !pos || pos.valid === false) return { linked: true, noSignal: true, position: null };

      const fixMs = new Date(pos.fixTime).getTime();
      const contactMs = device.lastUpdate ? new Date(device.lastUpdate).getTime() : 0;
      const lastSignalMs = Math.max(Number.isFinite(fixMs) ? fixMs : 0, Number.isFinite(contactMs) ? contactMs : 0);
      if (!lastSignalMs || now.getTime() - lastSignalMs > maxAgeMs) return { linked: true, noSignal: true, position: null };

      return { linked: true, noSignal: false, position: { lat: pos.latitude, lng: pos.longitude, fixTime: pos.fixTime } };
    } catch {
      return { linked: true, noSignal: true, position: null };
    }
  }

  /**
   * Posicion actual de UNA sola unidad (GPS real del vehiculo, via Traccar). Devuelve null si la
   * unidad no tiene dispositivo vinculado o su ultima señal ya no es reciente (ver
   * getVehicleHardwareStatus).
   */
  async getVehiclePosition(organizationId: string, vehicleId: string): Promise<{ lat: number; lng: number; fixTime: string } | null> {
    return (await this.getVehicleHardwareStatus(organizationId, vehicleId)).position;
  }

  /**
   * Historial de posiciones de UNA unidad entre dos fechas (Traccar
   * `/api/positions?deviceId=X&from=...&to=...`) -- a diferencia de
   * getVehiclePosition() (solo el ultimo fix), esto trae la serie completa
   * de fixes en la ventana pedida. Usado por la deteccion automatica de
   * posibles accidentes (docs/planes/ia-aplicada.md §3.1): para ver si el
   * vehiculo iba a velocidad normal y de golpe se quedo inmovil, hace falta
   * la secuencia, no solo el ultimo punto. Devuelve [] si la unidad no tiene
   * dispositivo vinculado o Traccar no lo reconoce -- nunca inventa fixes.
   */
  async getPositionHistory(
    organizationId: string,
    vehicleId: string,
    fromISO: string,
    toISO: string,
  ): Promise<{ lat: number; lng: number; speedKmh: number; course: number; motion: boolean; fixTime: string }[]> {
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id: vehicleId, organizationId } });
    if (!vehicle?.traccarDeviceId) return [];

    const devices = await this.traccarFetch<TraccarDevice[]>('/api/devices');
    const device = devices.find((d) => d.uniqueId === vehicle.traccarDeviceId);
    if (!device) return [];

    const path = `/api/positions?deviceId=${device.id}&from=${encodeURIComponent(fromISO)}&to=${encodeURIComponent(toISO)}`;
    const positions = await this.traccarFetch<TraccarPosition[]>(path);
    return positions
      .filter((p) => p.valid !== false)
      .map((p) => ({
        lat: p.latitude,
        lng: p.longitude,
        speedKmh: Math.round((p.speed || 0) * 1.852),
        course: p.course,
        // Traccar/el equipo calculan esto con el acelerometro, no solo con
        // GPS -- verificado en vivo el 12 sept 2026 contra ATIPCAR-001
        // parada: de 377 posiciones validas, 369 traian motion=false. Sin
        // esto, el "ruido" normal de posicion de un GPS parado (que a veces
        // supera el filtro de distancia) se dibujaba como si fuera un
        // desplazamiento real.
        motion: p.attributes?.motion ?? false,
        fixTime: p.fixTime,
      }))
      .sort((a, b) => new Date(a.fixTime).getTime() - new Date(b.fixTime).getTime());
  }

  /**
   * Estado de vinculacion GPS de TODAS las unidades de la asociacion (vinculadas
   * o no) -- para la pantalla de solo lectura "Dispositivos GPS" del admin. El
   * registrar/editar el dispositivo sigue siendo exclusivo de Super Admin en
   * Flota -> GPS; esto es solo consulta.
   */
  async getDeviceStatuses(organizationId: string): Promise<VehicleGpsStatus[]> {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { organizationId, status: { not: 'BAJA' } },
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
