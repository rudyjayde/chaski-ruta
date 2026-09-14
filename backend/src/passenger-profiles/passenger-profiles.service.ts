import { Injectable } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const MONTH_FORMATTER = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

// CRM de pasajeros por asociacion (12 sept 2026, decidido con Jayde): el
// perfil (PassengerProfile) ya lo alimenta ManifestsService cada vez que se
// agrega/digitaliza un pasajero -- este servicio solo lee, nunca inventa
// recurrencia ni datos que no vinieron de un manifiesto real.
@Injectable()
export class PassengerProfilesService {
  constructor(private prisma: PrismaService) {}

  findAll(organizationId: string) {
    return this.prisma.passengerProfile.findMany({
      where: { organizationId },
      orderBy: [{ tripCount: 'desc' }, { lastTripAt: 'desc' }],
      take: 1000,
    });
  }

  /**
   * Dashboard de pasajeros (12 sept 2026, decidido con Jayde): todo calculado
   * en el momento a partir de filas reales de Passenger+Manifest y del
   * PassengerProfile agregado -- nada precalculado ni inventado. Pensado
   * para volumenes chicos/medianos (una asociacion real hoy tiene cientos de
   * pasajeros, no millones), por eso se trae todo y se agrega en memoria en
   * vez de armar SQL agregado complejo.
   */
  async getDashboard(organizationId: string) {
    const [rows, profiles] = await Promise.all([
      this.prisma.passenger.findMany({
        where: { manifest: { organizationId } },
        select: {
          dni: true,
          fare: true,
          paymentMethod: true,
          origin: true,
          destination: true,
          manifest: { select: { date: true } },
        },
      }),
      this.prisma.passengerProfile.findMany({ where: { organizationId } }),
    ]);

    const profileByDni = new Map(profiles.map((p) => [p.dni, p]));

    // Top por cantidad de viajes -- directo del perfil ya agregado.
    const topByTrips = [...profiles]
      .sort((a, b) => b.tripCount - a.tripCount || (b.lastTripAt?.getTime() ?? 0) - (a.lastTripAt?.getTime() ?? 0))
      .slice(0, 10)
      .map((p) => ({ dni: p.dni, name: p.name, tripCount: p.tripCount, email: p.email }));

    // Ingreso acumulado por pasajero (suma de fare de todas sus filas reales).
    const revenueByDni = new Map<string, number>();
    const paymentAgg = new Map<PaymentMethod, { count: number; totalFare: number }>();
    const directionAgg = new Map<string, number>();
    const tripsByDniMonth = new Map<string, Set<string>>(); // dni -> set de meses en que viajo
    const dnisByMonth = new Map<string, Set<string>>(); // mes -> set de dnis que viajaron

    for (const row of rows) {
      revenueByDni.set(row.dni, (revenueByDni.get(row.dni) ?? 0) + row.fare);

      const pay = paymentAgg.get(row.paymentMethod) ?? { count: 0, totalFare: 0 };
      pay.count += 1;
      pay.totalFare += row.fare;
      paymentAgg.set(row.paymentMethod, pay);

      const label = `${row.origin} → ${row.destination}`;
      directionAgg.set(label, (directionAgg.get(label) ?? 0) + 1);

      if (row.manifest?.date) {
        const month = MONTH_FORMATTER(new Date(row.manifest.date));
        if (!tripsByDniMonth.has(row.dni)) tripsByDniMonth.set(row.dni, new Set());
        tripsByDniMonth.get(row.dni)!.add(month);
        if (!dnisByMonth.has(month)) dnisByMonth.set(month, new Set());
        dnisByMonth.get(month)!.add(row.dni);
      }
    }

    const topByRevenue = [...revenueByDni.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([dni, totalFare]) => ({ dni, name: profileByDni.get(dni)?.name ?? dni, totalFare: Math.round(totalFare * 100) / 100 }));

    const paymentMethods = [...paymentAgg.entries()]
      .map(([method, agg]) => ({ method, count: agg.count, totalFare: Math.round(agg.totalFare * 100) / 100 }))
      .sort((a, b) => b.count - a.count);

    const directions = [...directionAgg.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);

    // Nuevos vs recurrentes por mes: para cada dni, su primer mes real de
    // viaje define cuando es "nuevo" -- cualquier otro mes en que vuelve a
    // aparecer cuenta como "recurrente" ese mes (una sola vez por mes, no
    // por viaje individual).
    const firstMonthByDni = new Map<string, string>();
    for (const [dni, months] of tripsByDniMonth) {
      firstMonthByDni.set(dni, [...months].sort()[0]);
    }
    const monthKeys = [...dnisByMonth.keys()].sort().slice(-12); // ultimos 12 meses con datos
    const monthly = monthKeys.map((month) => {
      const dnis = dnisByMonth.get(month) ?? new Set();
      let newCount = 0;
      let recurrentCount = 0;
      for (const dni of dnis) {
        if (firstMonthByDni.get(dni) === month) newCount++;
        else recurrentCount++;
      }
      return { month, newCount, recurrentCount };
    });

    // % de pasajeros de ese mes que HOY tienen correo guardado en su perfil
    // (no es historico de aquel momento, es el estado actual -- se etiqueta
    // asi en el frontend).
    const emailCaptureByMonth = monthKeys.map((month) => {
      const dnis = [...(dnisByMonth.get(month) ?? [])];
      const withEmail = dnis.filter((dni) => !!profileByDni.get(dni)?.email).length;
      return { month, pct: dnis.length === 0 ? 0 : Math.round((withEmail / dnis.length) * 100) };
    });

    // Frecuencia real promedio entre viajes (solo pasajeros con 2+ viajes):
    // (ultimo viaje - primer viaje) / (cantidad de viajes - 1), en dias.
    const recurrentProfiles = profiles.filter((p) => p.tripCount >= 2 && p.lastTripAt);
    const avgDaysList = recurrentProfiles.map((p) => {
      const spanDays = (p.lastTripAt!.getTime() - p.createdAt.getTime()) / MS_PER_DAY;
      return spanDays / (p.tripCount - 1);
    });
    const avgDaysBetweenTrips = avgDaysList.length === 0 ? null : Math.round((avgDaysList.reduce((s, d) => s + d, 0) / avgDaysList.length) * 10) / 10;

    return {
      totals: {
        uniquePassengers: profiles.length,
        recurrentPassengers: profiles.filter((p) => p.tripCount >= 2).length,
        withEmail: profiles.filter((p) => !!p.email).length,
        totalTripRows: rows.length,
      },
      topByTrips,
      topByRevenue,
      paymentMethods,
      directions,
      monthly,
      emailCaptureByMonth,
      avgDaysBetweenTrips,
    };
  }
}
