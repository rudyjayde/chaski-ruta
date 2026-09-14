import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AnthropicService } from '../ai/anthropic.service';

export interface DigestFacts {
  fecha: string;
  vueltasCompletadasHoy: number;
  viajesEnCurso: number;
  pasajerosTransportadosHoy: number;
  recaudacionHoy: number;
  manifiestosPendientesDeDigitalizar: number;
  inscripcionesRetrasadasResueltasHoy: number;
  inscripcionesRetrasadasPendientesAhora: number;
  incidentesHoy: Array<{ unidad: string; ruta: string; nota: string | null }>;
  // Deteccion de anomalias en recaudacion (ia-aplicada.md §2.4): manifiestos
  // que el sistema marco CON_INCIDENCIA hoy por una caida fuerte de ingresos
  // frente al propio historial de esa unidad -- evidencia para revisar,
  // nunca una acusacion (ver manifests.service.ts#flagRevenueAnomalyIfAny).
  anomaliasRecaudacionHoy: Array<{ manifiesto: string; unidad: string; nota: string | null }>;
}

/**
 * Resumen diario para el gerente (ia-aplicada.md §2.3). Principio rector
 * (ia-aplicada.md §1): la IA sugiere/resume, nunca decide -- y en particular
 * "nunca inventa una cifra" (§2.3 explicito). Por eso TODAS las cifras de
 * este resumen se calculan aca con Prisma, de forma determinista, ANTES de
 * llamar a Claude -- Claude nunca ve la base de datos ni hace ningun
 * calculo, solo redacta en una o dos frases los numeros que ya le pasamos.
 * Si Claude fallara o no estuviera configurado, `facts` ya es un resumen
 * util por si solo (ver digest.controller.ts).
 */
@Injectable()
export class DigestService {
  constructor(
    private prisma: PrismaService,
    private anthropic: AnthropicService,
  ) {}

  async computeFacts(organizationId: string): Promise<DigestFacts> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [
      vueltasCompletadasHoy,
      viajesEnCurso,
      manifiestosHoy,
      manifiestosPendientesDeDigitalizar,
      inscripcionesRetrasadasResueltasHoy,
      inscripcionesRetrasadasPendientesAhora,
      incidentTrips,
      incidentManifests,
    ] = await Promise.all([
      this.prisma.trip.count({
        where: { organizationId, status: 'COMPLETADO', actualArrival: { gte: startOfDay } },
      }),
      this.prisma.trip.count({ where: { organizationId, status: 'ACTIVO' } }),
      this.prisma.manifest.findMany({
        where: { organizationId, createdAt: { gte: startOfDay } },
        select: { passengers: { select: { fare: true } } },
      }),
      this.prisma.manifest.count({ where: { organizationId, pendingDigitize: true } }),
      this.prisma.delayedRegistrationRequest.count({
        where: { organizationId, status: 'RESUELTO', resolvedAt: { gte: startOfDay } },
      }),
      this.prisma.delayedRegistrationRequest.count({ where: { organizationId, status: 'PENDIENTE' } }),
      this.prisma.trip.findMany({
        where: { organizationId, status: 'CON_INCIDENCIA', updatedAt: { gte: startOfDay } },
        select: { route: true, incidentNote: true, vehicle: { select: { code: true } } },
      }),
      this.prisma.manifest.findMany({
        where: { organizationId, status: 'CON_INCIDENCIA', updatedAt: { gte: startOfDay } },
        select: { number: true, correctionReason: true, vehicle: { select: { code: true } } },
      }),
    ]);

    const pasajerosTransportadosHoy = manifiestosHoy.reduce((sum, m) => sum + m.passengers.length, 0);
    const recaudacionHoy = manifiestosHoy.reduce(
      (sum, m) => sum + m.passengers.reduce((s, p) => s + p.fare, 0),
      0,
    );

    return {
      fecha: startOfDay.toISOString().slice(0, 10),
      vueltasCompletadasHoy,
      viajesEnCurso,
      pasajerosTransportadosHoy,
      recaudacionHoy: Math.round(recaudacionHoy * 100) / 100,
      manifiestosPendientesDeDigitalizar,
      inscripcionesRetrasadasResueltasHoy,
      inscripcionesRetrasadasPendientesAhora,
      incidentesHoy: incidentTrips.map((t) => ({
        unidad: t.vehicle.code,
        ruta: t.route === 'JULI_PUNO' ? 'Juli → Puno' : 'Puno → Juli',
        nota: t.incidentNote,
      })),
      anomaliasRecaudacionHoy: incidentManifests.map((m) => ({
        manifiesto: m.number,
        unidad: m.vehicle.code,
        nota: m.correctionReason,
      })),
    };
  }

  /**
   * Redacta el resumen en prosa a partir de `facts` -- best-effort: si
   * ANTHROPIC_API_KEY no esta configurada o Claude falla, devuelve null y
   * quien llama cae de vuelta a mostrar `facts` directamente (nunca se
   * bloquea el panel del gerente por esto).
   */
  async writeSummary(facts: DigestFacts): Promise<string | null> {
    const prompt = `Redacta en espanol, en un parrafo corto (maximo 3-4 frases, tono directo y profesional, sin emojis), el resumen operativo de hoy para el gerente de una asociacion de transporte interprovincial, usando UNICAMENTE estos datos ya calculados -- no agregues, calcules ni inventes ninguna cifra que no este aca:

${JSON.stringify(facts, null, 2)}

Si "incidentesHoy" tiene elementos, menciona brevemente la unidad y la ruta de cada uno. Si "anomaliasRecaudacionHoy" tiene elementos, menciona brevemente que hay manifiestos marcados para revisar por una caida de recaudacion frente a su propio historial (nunca lo presentes como un hecho confirmado ni como una acusacion). Si "manifiestosPendientesDeDigitalizar" es mayor a 0, menciona que hay manifiestos con respaldo en papel esperando completarse. Si "inscripcionesRetrasadasPendientesAhora" es mayor a 0, menciona que hay inscripciones retrasadas esperando resolucion del administrador. No repitas literalmente los nombres de los campos JSON -- redactalo como una nota humana, no como un volcado de datos.`;

    try {
      const text = await this.anthropic.textComplete(prompt, 400);
      return text.trim();
    } catch {
      return null;
    }
  }
}
