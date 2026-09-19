import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AnthropicService } from '../ai/anthropic.service';
import { CreateCommercialRequestDto } from './dto/create-commercial-request.dto';
import { JwtPayload } from '../auth/jwt.strategy';

// Saca el bloque JSON de la respuesta de Claude aunque venga envuelto en
// ```json ... ``` u otro texto alrededor -- mismo helper que
// manifests.service.ts, duplicado aca a proposito (cada modulo mantiene el
// suyo, no hay un util compartido todavia en este backend).
function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) return raw.slice(start, end + 1);
  return raw.trim();
}

export interface OnboardingSuggestion {
  name: string | null;
  ruc: string | null;
  city: string | null;
  adminName: string | null;
  adminEmail: string | null;
  adminPhone: string | null;
  plan: 'OPERACION' | 'PRO';
  units: string | null;
  gpsUnits: string | null;
  terminal1: string | null;
  terminal2: string | null;
  routes: { origin: string; destination: string }[];
  configNotes: string | null;
  aiParsed: boolean;
}

@Injectable()
export class CommercialRequestsService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private anthropic: AnthropicService,
  ) {}

  /**
   * Publico, sin autenticacion -- cualquiera que llena el formulario de la
   * landing llega aqui. NO crea asociacion, usuario, suscripcion ni pago
   * (docs/planes/landing-publica-y-solicitudes-comerciales.md §5) -- solo
   * guarda la solicitud y avisa por correo. Si el correo falla, la
   * solicitud ya quedo guardada de todas formas (mail.service.ts es best-
   * effort, nunca lanza).
   */
  async create(dto: CreateCommercialRequestDto) {
    // Campo trampa anti-robots (ver CreateCommercialRequestDto.website).
    if (dto.website?.trim()) return { id: 'descartado' };
    // `answers` es un objeto libre: se limita su tamaño para que nadie guarde megas.
    if (JSON.stringify(dto.answers ?? {}).length > 10_000) {
      throw new BadRequestException('El formulario tiene demasiado contenido. Revisa las respuestas e intenta de nuevo.');
    }
    const request = await this.prisma.commercialRequest.create({
      data: {
        solution: dto.solution,
        contactName: dto.contactName,
        contactEmail: dto.contactEmail.toLowerCase(),
        contactPhone: dto.contactPhone,
        orgName: dto.orgName,
        ruc: dto.ruc,
        answers: dto.answers as any,
      },
    });
    await this.mail.sendCommercialRequestNotification(request);
    return { id: request.id };
  }

  /** Solo Super Admin -- listado completo para revisar y dar seguimiento. */
  findAll() {
    return this.prisma.commercialRequest.findMany({
      orderBy: { createdAt: 'desc' },
      include: { reviewedBy: { select: { id: true, name: true } } },
    });
  }

  async findOne(id: string) {
    const request = await this.prisma.commercialRequest.findUnique({
      where: { id },
      include: { reviewedBy: { select: { id: true, name: true } } },
    });
    if (!request) throw new NotFoundException('Solicitud comercial no encontrada');
    return request;
  }

  /**
   * Triaje automático (ia-aplicada.md §2.1): resumen ejecutivo breve para
   * que el Super Admin evalue mas rapido antes de la llamada -- nunca
   * cambia el flujo comercial ya definido, nadie se activa ni se contacta
   * solo. Best-effort: si Claude no esta configurado o falla, devuelve
   * summary null y el Super Admin sigue viendo el formulario completo tal
   * cual (esto nunca reemplaza el detalle real, solo lo adelanta).
   *
   * Solo se le pasan a Claude los datos que el propio interesado escribio
   * en su solicitud -- nunca se le pide inventar ni suponer nada que no
   * este ahi (ej. nunca un tamaño de operacion que el formulario no dio).
   */
  async triage(id: string): Promise<{ summary: string | null }> {
    const request = await this.findOne(id);
    const prompt = `Eres un asistente que ayuda al equipo comercial de CHASKI AI (una plataforma de gestion para asociaciones de transporte interprovincial en Peru) a evaluar rapido una solicitud comercial antes de llamar al interesado. Redacta un resumen ejecutivo de 1-2 frases en español, directo y profesional, usando UNICAMENTE estos datos -- nunca inventes ni supongas un dato que no este aca (si algo no esta, simplemente no lo menciones):

${JSON.stringify(
  {
    solucionSolicitada: request.solution,
    nombreDeContacto: request.contactName,
    asociacionOEmpresa: request.orgName,
    ruc: request.ruc,
    respuestasDelFormulario: request.answers,
  },
  null,
  2,
)}

Si "respuestasDelFormulario" incluye un numero de unidades/vehiculos, menciona el tamaño aproximado de la operacion, y si el tamaño es claramente grande o pequeño puedes cerrar con una sugerencia breve de prioridad (ej. "posible prioridad alta por tamaño") -- siempre como sugerencia, nunca como decision, y solo si el dato de tamaño esta explicito en el formulario. Si incluye comentarios relevantes, resumelos brevemente. No repitas los nombres de los campos JSON tal cual -- redactalo como una nota humana breve, no como un volcado de datos.`;

    try {
      const summary = await this.anthropic.textComplete(prompt, 300);
      return { summary: summary.trim() };
    } catch {
      return { summary: null };
    }
  }

  /**
   * Asistente de onboarding (ia-aplicada.md §2.5): ayuda a poblar el wizard
   * "Nueva asociación" a partir de lo que el interesado ya escribió en su
   * Solicitud comercial -- nunca crea nada, solo devuelve una SUGERENCIA que
   * el Super Admin ve pre-llenada en el wizard y puede editar o borrar antes
   * de confirmar (mismo principio rector que el resto de IA del sistema:
   * sugiere, nunca decide, ia-aplicada.md §1).
   *
   * Los datos directos del formulario (nombre, RUC, contacto, ciudad,
   * unidades) se copian tal cual -- no hace falta IA para eso, y copiarlos
   * con Claude solo agregaria riesgo de que invente algo. Lo unico que
   * realmente necesita interpretacion es el campo de texto libre "routes"
   * (el interesado escribe su corredor como quiere, ej. "Juli - Puno, con
   * parada en Ilave") -- ahi si conviene una lectura de Claude para separar
   * terminal de origen/destino. Si el campo esta vacio, o Claude no esta
   * configurado, o no puede identificar con confianza dos terminales, esos
   * campos simplemente quedan vacios (aiParsed:false) -- nunca se inventa un
   * terminal que el formulario no sugirio.
   */
  async onboardingSuggestion(id: string): Promise<OnboardingSuggestion> {
    const request = await this.findOne(id);
    const answers = (request.answers ?? {}) as Record<string, unknown>;
    const asString = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

    const base: OnboardingSuggestion = {
      name: request.orgName,
      ruc: request.ruc,
      city: asString(answers.city),
      adminName: request.contactName,
      adminEmail: request.contactEmail,
      adminPhone: request.contactPhone,
      plan: request.solution === 'PRO' ? 'PRO' : 'OPERACION',
      units: asString(answers.totalUnits),
      gpsUnits: asString(answers.gpsUnits),
      terminal1: null,
      terminal2: null,
      routes: [],
      configNotes: asString(answers.comments),
      aiParsed: false,
    };

    const routesText = asString(answers.routes);
    if (!routesText) return base;

    const prompt = `Un interesado en contratar CHASKI AI (plataforma de gestion para asociaciones de transporte interprovincial en Peru) describio asi su corredor/ruta en el formulario de contacto:

"${routesText}"

${base.city ? `Tambien indico esta ciudad/ubicacion: "${base.city}".` : ''}

Devuelve UNICAMENTE un JSON valido (sin texto adicional, sin markdown) con esta forma exacta:
{"terminal1": "nombre del primer terminal o null", "terminal2": "nombre del segundo terminal o null", "routes": [{"origin":"...","destination":"..."}], "configNotes": "nota breve con cualquier detalle relevante que no encaje en los campos anteriores, o null"}

Reglas estrictas:
- terminal1/terminal2 son los DOS extremos del corredor principal (ej. "Juli" y "Puno"). Si el texto no permite identificar con confianza dos terminales, devuelve null en ambos -- nunca inventes un nombre de ciudad que no este en el texto.
- "routes" son rutas ADICIONALES mencionadas aparte del corredor principal (ej. una parada intermedia con su propia ruta) -- si no hay ninguna ruta adicional clara, devuelve un array vacio.
- No repitas el texto original tal cual en "configNotes" -- solo si hay un detalle operativo relevante (frecuencia, unidades especiales, etc.) que valga la pena que el Super Admin vea, resumelo en una frase. Si no hay nada asi, devuelve null.`;

    try {
      const raw = await this.anthropic.textComplete(prompt, 300);
      const parsed = JSON.parse(extractJson(raw)) as {
        terminal1?: string | null;
        terminal2?: string | null;
        routes?: { origin?: string; destination?: string }[];
        configNotes?: string | null;
      };
      const routes = Array.isArray(parsed.routes)
        ? parsed.routes
            .filter((r) => typeof r?.origin === 'string' && typeof r?.destination === 'string' && r.origin.trim() && r.destination.trim())
            .map((r) => ({ origin: r.origin!.trim(), destination: r.destination!.trim() }))
        : [];
      return {
        ...base,
        terminal1: asString(parsed.terminal1),
        terminal2: asString(parsed.terminal2),
        routes,
        configNotes: asString(parsed.configNotes) ?? base.configNotes,
        aiParsed: true,
      };
    } catch {
      // Best-effort: si Claude no esta configurado o falla, o la respuesta no
      // se pudo interpretar, el Super Admin sigue viendo los datos directos
      // (base) y llena terminales/rutas a mano como ya hacia antes de esto.
      return base;
    }
  }

  /**
   * Solo Super Admin -- registra que ya revisó la solicitud, con notas
   * internas opcionales (nunca visibles para el interesado). No cambia nada
   * fuera de este registro: cotización, pago e instalación siguen pasando
   * por fuera del sistema hasta la creación real de la asociación.
   */
  async markReviewed(id: string, actor: JwtPayload, notes?: string) {
    await this.findOne(id);
    return this.prisma.commercialRequest.update({
      where: { id },
      data: {
        status: 'CONTACTADA',
        reviewedById: actor.sub,
        reviewedAt: new Date(),
        ...(notes !== undefined ? { notes } : {}),
      },
    });
  }
}
