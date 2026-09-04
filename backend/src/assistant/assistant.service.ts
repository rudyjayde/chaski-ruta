import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../prisma/prisma.service';

// Motor del asistente conversacional (docs/planes/plan-pro.md #6, "{Asociacion} AI").
// Regla de diseno obligatoria: Claude SOLO puede responder con datos reales llamando
// a una de las herramientas de abajo (function/tool calling) -- nunca debe inventar
// ni calcular una cifra de memoria, para que nunca "alucine" un dato operativo.
const MODEL = 'claude-sonnet-4-5-20250929';
const MAX_TOOL_ROUNDS = 5;

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

@Injectable()
export class AssistantService {
  private client: Anthropic | null = null;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (apiKey) {
      this.client = new Anthropic({ apiKey });
    }
  }

  async chat(
    organizationId: string,
    orgName: string,
    actorName: string | null,
    message: string,
    history: ChatTurn[] = [],
  ): Promise<string> {
    if (!this.client) {
      throw new InternalServerErrorException(
        'El asistente no esta configurado. Agrega ANTHROPIC_API_KEY en backend/.env (console.anthropic.com -> API Keys) y reinicia el servidor.',
      );
    }
    if (!message || !message.trim()) {
      throw new BadRequestException('El mensaje no puede estar vacio.');
    }

    const nombre = actorName?.trim() || null;
    const system = `Eres "${orgName} AI", el asistente del panel de administracion de la asociacion de transporte ${orgName} dentro de CHASKI RUTA. Hablas con ${nombre ?? 'el administrador'}.

Como hablas (muy importante):
- Lenguaje natural y conversacional, como un colega que conoce el negocio -- NUNCA como un menu de opciones ni una lista de funciones disponibles.
- NUNCA uses markdown: nada de **negritas**, guiones de lista, numeracion ni encabezados -- esto se muestra como texto plano en un chat, no en un documento.
- Si te saludan (ej. "hola"), saluda de vuelta por su nombre y pregunta en que puedes ayudar, en una frase corta y natural -- por ejemplo "Hola ${nombre ?? ''}, ¿que necesitas saber hoy?" -- NUNCA respondas un saludo con una lista de todo lo que sabes hacer.
- Responde solo lo que te preguntan, sin relleno ni resumenes de tus capacidades. Ejemplo de tono correcto: "Hola Carlos, el vehiculo 001 esta en cola Puno-Juli, posicion 2." Ejemplo de tono incorrecto: una lista con titulos y vinetas.
- Cuando la pregunta es general (ej. "cuantos vehiculos tenemos", "cuantos conductores hay"), da primero el numero total en una frase corta, como lo diria una persona -- y OFRECE el detalle en vez de volcarlo todo de una. Solo das el desglose completo si te lo piden despues o si preguntan algo ya especifico (ej. "cuantos tiene Virgen de Fatima"). Ejemplo correcto -- turno 1: "Tenemos 16 vehiculos registrados, todos activos. ¿Quieres que te diga cuantos tiene cada empresa?"; si dicen que si, turno 2: "Claro: Virgen de Fatima 5, Sur Andino 3, San Miguel 3, San Francisco de Borja 3 y Litoral 2." Ejemplo incorrecto: meter el desglose completo por empresa en la primera respuesta sin que lo pidan.

Regla obligatoria sobre datos: nunca inventes ni calcules de memoria una cifra operativa (ubicacion, vueltas, cola, recaudacion, etc.) -- toda respuesta con datos debe venir de una llamada a una de tus herramientas. Si la pregunta no se puede responder con las herramientas disponibles, dilo con claridad en vez de adivinar.

Regla obligatoria de aislamiento entre asociaciones (muy importante, nunca la rompas): SOLO tienes acceso a los datos de ${orgName}. Cada asociacion cliente de CHASKI RUTA tiene su propio asistente, sin cruce de informacion entre ellas. Si te preguntan por otra asociacion de transporte -- por su nombre, o de forma general ("y las demas asociaciones", "comparame con otra") -- responde con claridad que no tienes autorizacion para ver datos de otras asociaciones y que cada asociacion solo ve la suya. Nunca asumas, nunca inventes, nunca compares. Ojo con la ambiguedad: dentro de ${orgName} puede haber EMPRESAS MIEMBRO cuyo nombre se parezca al de otra asociacion (ej. una empresa llamada igual que una asociacion distinta) -- esos datos SI son tuyos porque son parte de ${orgName}; si hay duda, aclara la diferencia en vez de asumir cual quiso decir la persona.`;

    const messages: Anthropic.MessageParam[] = [
      ...history.map((h) => ({ role: h.role, content: h.content }) as Anthropic.MessageParam),
      { role: 'user', content: message },
    ];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await this.client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system,
        tools: this.tools(),
        messages,
      });

      if (response.stop_reason !== 'tool_use') {
        const text = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
          .trim();
        return text || 'No tengo una respuesta para eso.';
      }

      messages.push({ role: 'assistant', content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;
        const result = await this.runTool(organizationId, block.name, (block.input as Record<string, any>) || {});
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }
      messages.push({ role: 'user', content: toolResults });
    }

    return 'No pude terminar de procesar tu pregunta -- intenta de nuevo o reformula la consulta.';
  }

  private tools(): Anthropic.Tool[] {
    return [
      {
        name: 'buscar_vehiculo',
        description:
          'Busca una unidad por su codigo y devuelve su estado actual: si esta en cola (con posicion y estado) o tiene un viaje activo. Usa esto para preguntas como "donde esta el vehiculo 001".',
        input_schema: {
          type: 'object',
          properties: {
            codigo: { type: 'string', description: 'Codigo de la unidad, ej. "001"' },
          },
          required: ['codigo'],
        },
      },
      {
        name: 'buscar_conductor',
        description: 'Busca un conductor por nombre (busqueda parcial, sin distinguir mayusculas) y devuelve su codigo de unidad, empresa y estado de cuenta.',
        input_schema: {
          type: 'object',
          properties: {
            nombre: { type: 'string', description: 'Nombre o parte del nombre del conductor' },
          },
          required: ['nombre'],
        },
      },
      {
        name: 'contar_vueltas',
        description:
          'Cuenta las vueltas de un vehiculo o conductor en un rango de fechas. Vuelta completa = ida (Juli->Puno) + vuelta (Puno->Juli); un solo tramo cuenta como media vuelta.',
        input_schema: {
          type: 'object',
          properties: {
            codigo_vehiculo: { type: 'string', description: 'Codigo de unidad (usa este o nombre_conductor)' },
            nombre_conductor: { type: 'string', description: 'Nombre del conductor (usa este o codigo_vehiculo)' },
            desde: { type: 'string', description: 'Fecha inicio YYYY-MM-DD (opcional, default hoy)' },
            hasta: { type: 'string', description: 'Fecha fin YYYY-MM-DD (opcional, default hoy)' },
          },
          required: [],
        },
      },
      {
        name: 'estado_cola',
        description: 'Devuelve la cola en vivo de una direccion: posicion, unidad, conductor y estado de cada vehiculo inscrito.',
        input_schema: {
          type: 'object',
          properties: {
            ruta: { type: 'string', enum: ['JULI_PUNO', 'PUNO_JULI'], description: 'Direccion de la cola' },
          },
          required: ['ruta'],
        },
      },
      {
        name: 'resumen_dia',
        description: 'Resumen operativo de un dia: viajes completados, pasajeros transportados y recaudacion por metodo de pago.',
        input_schema: {
          type: 'object',
          properties: {
            fecha: { type: 'string', description: 'Fecha YYYY-MM-DD (opcional, default hoy)' },
          },
          required: [],
        },
      },
      {
        name: 'resumen_flota',
        description:
          'Cuenta y lista los vehiculos/unidades registrados en la asociacion, con desglose por estado y por empresa. Usa esto para preguntas como "cuantos vehiculos tenemos" o "cuantas unidades hay activas".',
        input_schema: {
          type: 'object',
          properties: {
            estado: { type: 'string', enum: ['ACTIVO', 'INACTIVO', 'SUSPENDIDO'], description: 'Filtrar solo por este estado (opcional)' },
          },
          required: [],
        },
      },
      {
        name: 'resumen_personas',
        description:
          'Cuenta y lista las personas registradas en la asociacion (conductores, socios o administradores), con desglose por rol y por estado de cuenta. Usa esto para preguntas como "cuantos conductores tenemos" o "cuantos socios hay activos".',
        input_schema: {
          type: 'object',
          properties: {
            rol: { type: 'string', enum: ['CONDUCTOR', 'SOCIO', 'ADMINISTRADOR'], description: 'Filtrar solo por este rol (opcional, si no se indica cuenta todos)' },
          },
          required: [],
        },
      },
      {
        name: 'resumen_empresas',
        description:
          'Cuenta y lista las empresas miembro de la asociacion, con su estado y cuantos vehiculos tiene cada una. Usa esto para preguntas como "cuantas empresas integrantes tenemos".',
        input_schema: { type: 'object', properties: {}, required: [] },
      },
    ];
  }

  private async runTool(organizationId: string, name: string, input: Record<string, any>): Promise<unknown> {
    try {
      switch (name) {
        case 'buscar_vehiculo':
          return await this.toolBuscarVehiculo(organizationId, input.codigo);
        case 'buscar_conductor':
          return await this.toolBuscarConductor(organizationId, input.nombre);
        case 'contar_vueltas':
          return await this.toolContarVueltas(organizationId, input);
        case 'estado_cola':
          return await this.toolEstadoCola(organizationId, input.ruta);
        case 'resumen_dia':
          return await this.toolResumenDia(organizationId, input.fecha);
        case 'resumen_flota':
          return await this.toolResumenFlota(organizationId, input.estado);
        case 'resumen_personas':
          return await this.toolResumenPersonas(organizationId, input.rol);
        case 'resumen_empresas':
          return await this.toolResumenEmpresas(organizationId);
        default:
          return { error: `Herramienta desconocida: ${name}` };
      }
    } catch (err: any) {
      return { error: err?.message || 'Error ejecutando la consulta' };
    }
  }

  private async toolBuscarVehiculo(organizationId: string, codigo: string) {
    if (!codigo) return { error: 'Falta el codigo de la unidad' };
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { organizationId, code: codigo },
      include: { company: true, currentDriver: true },
    });
    if (!vehicle) {
      return { encontrado: false, mensaje: `No existe ninguna unidad con codigo "${codigo}" en esta asociacion.` };
    }

    const queueEntry = await this.prisma.queueEntry.findFirst({
      where: { organizationId, vehicleId: vehicle.id },
    });
    const activeTrip = await this.prisma.trip.findFirst({
      where: { organizationId, vehicleId: vehicle.id, status: { in: ['PROGRAMADO', 'ACTIVO', 'CON_INCIDENCIA'] } },
      orderBy: { createdAt: 'desc' },
    });

    return {
      encontrado: true,
      codigo: vehicle.code,
      placa: vehicle.plate,
      tipo: vehicle.vehicleType,
      empresa: vehicle.company.name,
      conductor_actual: vehicle.currentDriver?.name ?? null,
      estado_vehiculo: vehicle.status,
      en_cola: queueEntry ? { ruta: queueEntry.route, posicion: queueEntry.position, estado: queueEntry.status } : null,
      viaje_activo: activeTrip ? { ruta: activeTrip.route, estado: activeTrip.status, salida: activeTrip.actualDeparture } : null,
    };
  }

  private async toolBuscarConductor(organizationId: string, nombre: string) {
    if (!nombre) return { error: 'Falta el nombre del conductor' };
    const drivers = await this.prisma.person.findMany({
      where: { organizationId, role: 'CONDUCTOR', name: { contains: nombre, mode: 'insensitive' } },
      take: 5,
    });
    if (drivers.length === 0) {
      return { encontrado: false, mensaje: `No se encontro ningun conductor con el nombre "${nombre}".` };
    }
    return {
      encontrado: true,
      resultados: drivers.map((d) => ({ nombre: d.name, codigo_unidad: d.code, empresa: d.company, estado_cuenta: d.status })),
    };
  }

  private async toolContarVueltas(
    organizationId: string,
    input: { codigo_vehiculo?: string; nombre_conductor?: string; desde?: string; hasta?: string },
  ) {
    const { codigo_vehiculo, nombre_conductor, desde, hasta } = input;
    if (!codigo_vehiculo && !nombre_conductor) {
      return { error: 'Debes indicar codigo_vehiculo o nombre_conductor.' };
    }

    let vehicleId: string | undefined;
    let driverId: string | undefined;
    let etiqueta = '';

    if (codigo_vehiculo) {
      const vehicle = await this.prisma.vehicle.findFirst({ where: { organizationId, code: codigo_vehiculo } });
      if (!vehicle) return { encontrado: false, mensaje: `No existe la unidad "${codigo_vehiculo}".` };
      vehicleId = vehicle.id;
      etiqueta = `unidad ${vehicle.code}`;
    }
    if (nombre_conductor) {
      const driver = await this.prisma.person.findFirst({
        where: { organizationId, role: 'CONDUCTOR', name: { contains: nombre_conductor, mode: 'insensitive' } },
      });
      if (!driver) return { encontrado: false, mensaje: `No se encontro al conductor "${nombre_conductor}".` };
      driverId = driver.id;
      etiqueta = driver.name;
    }

    const today = new Date().toISOString().slice(0, 10);
    const desdeStr = desde || today;
    const hastaStr = hasta || today;
    const from = new Date(`${desdeStr}T00:00:00`);
    const to = new Date(`${hastaStr}T23:59:59`);

    const trips = await this.prisma.trip.findMany({
      where: {
        organizationId,
        status: 'COMPLETADO',
        ...(vehicleId ? { vehicleId } : {}),
        ...(driverId ? { driverId } : {}),
        actualArrival: { gte: from, lte: to },
      },
      orderBy: { actualArrival: 'asc' },
    });

    const tramos = trips.length;
    const vueltas = Math.floor(tramos / 2);
    const mediaVueltaExtra = tramos % 2 === 1;

    return {
      encontrado: true,
      quien: etiqueta,
      periodo: `${desdeStr} a ${hastaStr}`,
      tramos_completados: tramos,
      vueltas_completas: vueltas,
      media_vuelta_extra: mediaVueltaExtra,
    };
  }

  private async toolEstadoCola(organizationId: string, ruta: string) {
    if (ruta !== 'JULI_PUNO' && ruta !== 'PUNO_JULI') {
      return { error: 'ruta invalida, usa JULI_PUNO o PUNO_JULI' };
    }
    const entries = await this.prisma.queueEntry.findMany({
      where: { organizationId, route: ruta as any },
      include: { vehicle: true, driver: true },
      orderBy: { position: 'asc' },
    });
    return {
      ruta,
      total_en_cola: entries.length,
      cola: entries.map((e) => ({ posicion: e.position, unidad: e.vehicle.code, conductor: e.driver.name, estado: e.status })),
    };
  }

  private async toolResumenDia(organizationId: string, fecha?: string) {
    const fechaStr = fecha || new Date().toISOString().slice(0, 10);
    const from = new Date(`${fechaStr}T00:00:00`);
    const to = new Date(`${fechaStr}T23:59:59`);

    const viajesCompletados = await this.prisma.trip.count({
      where: { organizationId, status: 'COMPLETADO', actualArrival: { gte: from, lte: to } },
    });

    const manifiestos = await this.prisma.manifest.findMany({
      where: { organizationId, date: { gte: from, lte: to } },
      include: { passengers: true },
    });

    const pasajeros = manifiestos.reduce((acc, m) => acc + m.passengers.length, 0);
    const recaudacionPorMetodo: Record<string, number> = {};
    for (const m of manifiestos) {
      for (const p of m.passengers) {
        recaudacionPorMetodo[p.paymentMethod] = (recaudacionPorMetodo[p.paymentMethod] || 0) + p.fare;
      }
    }

    return {
      fecha: fechaStr,
      viajes_completados: viajesCompletados,
      pasajeros_transportados: pasajeros,
      recaudacion_por_metodo: recaudacionPorMetodo,
      recaudacion_total: Object.values(recaudacionPorMetodo).reduce((a, b) => a + b, 0),
    };
  }

  private async toolResumenFlota(organizationId: string, estado?: string) {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { organizationId, ...(estado ? { status: estado as any } : {}) },
      include: { company: true },
      orderBy: { code: 'asc' },
    });
    const porEstado: Record<string, number> = {};
    const porEmpresa: Record<string, number> = {};
    for (const v of vehicles) {
      porEstado[v.status] = (porEstado[v.status] || 0) + 1;
      porEmpresa[v.company.name] = (porEmpresa[v.company.name] || 0) + 1;
    }
    return {
      total: vehicles.length,
      por_estado: porEstado,
      por_empresa: porEmpresa,
      codigos: vehicles.map((v) => v.code),
    };
  }

  private async toolResumenPersonas(organizationId: string, rol?: string) {
    const people = await this.prisma.person.findMany({
      where: {
        organizationId,
        ...(rol ? { role: rol as any } : { role: { in: ['CONDUCTOR', 'SOCIO', 'ADMINISTRADOR'] } }),
      },
    });
    const porRol: Record<string, number> = {};
    const porEstadoCuenta: Record<string, number> = {};
    for (const p of people) {
      porRol[p.role] = (porRol[p.role] || 0) + 1;
      porEstadoCuenta[p.status] = (porEstadoCuenta[p.status] || 0) + 1;
    }
    return {
      total: people.length,
      por_rol: porRol,
      por_estado_cuenta: porEstadoCuenta,
    };
  }

  private async toolResumenEmpresas(organizationId: string) {
    const companies = await this.prisma.company.findMany({
      where: { organizationId },
      include: { vehicles: true },
      orderBy: { name: 'asc' },
    });
    return {
      total: companies.length,
      empresas: companies.map((c) => ({ nombre: c.name, estado: c.status, vehiculos: c.vehicles.length })),
    };
  }
}
