import { BadRequestException, type ValidationError } from '@nestjs/common';

// class-validator devuelve sus mensajes por defecto en ingles ("fare must not be
// less than 0"). Aqui se traducen al español que ve el usuario. Los mensajes
// propios del proyecto (validators.ts) ya estan en español y pasan sin cambios.
const LABELS: Record<string, string> = {
  name: 'El nombre', adminName: 'El nombre del administrador', contactName: 'El nombre de contacto', consumerName: 'El nombre',
  guardianName: 'El nombre del apoderado', legalRep: 'El representante legal', legalRepName: 'El representante legal',
  email: 'El correo', contactEmail: 'El correo', consumerEmail: 'El correo', adminEmail: 'El correo del administrador',
  phone: 'El celular', dni: 'El documento', ruc: 'El RUC', code: 'El código', company: 'La empresa', orgName: 'El nombre de la asociación',
  city: 'La ciudad', logoUrl: 'La dirección del logo', reason: 'El motivo', note: 'La nota', notes: 'Las notas',
  detail: 'El detalle', message: 'El mensaje', subject: 'El asunto', title: 'El título', body: 'El texto', response: 'La respuesta',
  providerResponse: 'La respuesta', consumerRequest: 'Lo que solicitas', serviceDescription: 'La descripción del servicio',
  consumerAddress: 'La dirección', origin: 'El origen', destination: 'El destino', windowLabel: 'La ventana horaria',
  compensation: 'La compensación', licenseCategory: 'La categoría de la licencia', folder: 'La carpeta', password: 'La contraseña',
  seat: 'El asiento', fare: 'La tarifa', capacity: 'La capacidad', claimedAmount: 'El monto reclamado', year: 'El año',
  gpsRadiusMeters: 'El radio del GPS', minTripMinutesOutbound: 'El tiempo mínimo de ida', minTripMinutesReturn: 'El tiempo mínimo de vuelta',
  timeoutMinutes: 'El tiempo de espera', anomalySpeedThresholdKmh: 'La velocidad de alerta', gpsVehicularGraceDays: 'Los días de gracia',
  terminalOriginName: 'El nombre del terminal de origen', terminalDestinationName: 'El nombre del terminal de destino',
  terminalOriginAddress: 'La dirección del terminal de origen', terminalDestinationAddress: 'La dirección del terminal de destino',
  terminalOriginLat: 'La latitud del terminal de origen', terminalOriginLng: 'La longitud del terminal de origen',
  terminalDestinationLat: 'La latitud del terminal de destino', terminalDestinationLng: 'La longitud del terminal de destino',
  initialConfigNotes: 'Las notas de configuración', lastServiceKm: 'El kilometraje del último servicio', serviceIntervalKm: 'El intervalo de servicio',
  history: 'El historial', content: 'El mensaje', ids: 'La selección', vehicleIds: 'Las unidades',
};

const label = (property: string) => LABELS[property] ?? `El campo "${property}"`;

const RULES: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^(\w+) must be shorter than or equal to (\d+) characters$/, (m) => `${label(m[1])} no puede superar ${m[2]} caracteres.`],
  [/^(\w+) must be longer than or equal to (\d+) characters$/, (m) => `${label(m[1])} debe tener al menos ${m[2]} caracteres.`],
  [/^(\w+) must not be less than (-?\d+(?:\.\d+)?)$/, (m) => `${label(m[1])} no puede ser menor que ${m[2]}.`],
  [/^(\w+) must not be greater than (-?\d+(?:\.\d+)?)$/, (m) => `${label(m[1])} no puede ser mayor que ${m[2]}.`],
  [/^(\w+) must contain no more than (\d+) elements$/, (m) => `${label(m[1])} admite como máximo ${m[2]} elementos.`],
  [/^(\w+) must contain at least (\d+) elements$/, (m) => `${label(m[1])} necesita al menos ${m[2]} elemento(s).`],
  [/^(\w+) must be an email$/, (m) => `${label(m[1])} no es un correo válido.`],
  [/^(\w+) must be a string$/, (m) => `${label(m[1])} es obligatorio.`],
  [/^(\w+) should not be empty$/, (m) => `${label(m[1])} es obligatorio.`],
  [/^(\w+) must be an integer number$/, (m) => `${label(m[1])} debe ser un número entero.`],
  [/^(\w+) must be a number.*$/, (m) => `${label(m[1])} debe ser un número.`],
  [/^(\w+) must be one of the following values: (.+)$/, (m) => `${label(m[1])} no es válido. Opciones: ${m[2]}.`],
  [/^(\w+) must be a valid ISO 8601 date string$/, (m) => `${label(m[1])} no es una fecha válida.`],
  [/^(\w+) must be a boolean value$/, (m) => `${label(m[1])} debe ser sí o no.`],
  [/^(\w+) must be a latitude string or number$/, (m) => `${label(m[1])} no es una latitud válida.`],
  [/^(\w+) must be a longitude string or number$/, (m) => `${label(m[1])} no es una longitud válida.`],
  [/^property (\w+) should not exist$/, (m) => `No se permite el campo "${m[1]}".`],
];

export function translateValidationMessage(message: string): string {
  for (const [pattern, build] of RULES) {
    const match = message.match(pattern);
    if (match) return build(match);
  }
  return message;
}

function collect(errors: ValidationError[], into: string[]) {
  for (const error of errors) {
    for (const message of Object.values(error.constraints ?? {})) into.push(translateValidationMessage(message));
    if (error.children?.length) collect(error.children, into);
  }
}

export function validationExceptionFactory(errors: ValidationError[]): BadRequestException {
  const messages: string[] = [];
  collect(errors, messages);
  return new BadRequestException({ message: messages, error: 'Bad Request', statusCode: 400 });
}
