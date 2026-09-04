import type { QueueEntry } from '../types';

export type OperationalPosition = { label: string; filterKey: string; className: string };

// Color por estado de cola — usado en badges simples (texto del estado tal cual).
export const STATUS_COLOR: Record<string, string> = {
  PREINSCRITO: 'bg-[#F4F4F5] text-t2',
  INSCRITO: 'bg-primary/10 text-primary',
  LLAMADO: 'bg-accent/20 text-accent',
  'EN TERMINAL': 'bg-teal/10 text-teal',
  EMBARCANDO: 'bg-warn/20 text-warn',
  LISTO: 'bg-ok/10 text-ok',
  SALIO: 'bg-t2/10 text-t2',
  AUSENTE: 'bg-danger/10 text-danger',
  RETIRADO: 'bg-t2/10 text-t2',
};

/**
 * Separa la unidad que esta siendo llamada ahora mismo ("calling") del resto que
 * sigue esperando su turno ("waiting", ya ordenado por posicion FIFO real). Se
 * usa tanto para pintar "Posiciones del Terminal" como para el
 * badge de "Posicion operativa" de cada fila.
 */
export function getOperationalState(entries: QueueEntry[]) {
  const ordered = [...entries].sort((a, b) => a.position - b.position);
  const active = ordered.filter(entry => !['AUSENTE', 'RETIRADO', 'SALIO'].includes(entry.status));
  const calling = active.find(entry => entry.status === 'LLAMADO') ?? null;
  const waiting = active.filter(entry => entry.id !== calling?.id);
  return { calling, waiting };
}

/**
 * Cuenta cuantas unidades activas (no AUSENTE/RETIRADO/SALIO) estan por delante
 * de esta entrada en el orden real de salida, incluyendo a la unidad que esta
 * siendo LLAMADA en este momento si la hay. Pensado para mensajes tipo
 * "Te faltan N vehiculos para salir" en vez de mostrar solo el numero crudo
 * de posicion de registro (que puede confundirse con el badge operativo).
 */
export interface QueueDisplayRow {
  entry: QueueEntry;
  /** Posición mostrada en la columna "Pos." — orden real de salida (1 = LLAMANDO,
   * luego EN COLA 2, 3, 4... en orden). null para AUSENTE/RETIRADO/SALIO, que
   * ya no cuentan para el orden de salida y se listan al final solo como registro. */
  displayPos: number | null;
}

/**
 * Orden real de visualización de la tabla de Cola (admin y conductor). La
 * unidad LLAMANDO (si hay) encabeza la lista con Pos. 1 — sin importar cual
 * haya sido su posición cruda de registro — seguida del resto en su orden de
 * espera real (EN COLA 2, 3, 4...). AUSENTE/RETIRADO/SALIO van al
 * final, sin numero de posición, solo como registro visible.
 *
 * El "position" crudo que llega del backend NO se modifica en ningun lado —
 * sigue siendo el orden de registro real, usado para las reglas de negocio
 * (FIFO de ingreso a cola, antifraude, etc). Esto es puramente de pantalla.
 */
export function getQueueDisplayOrder(entries: QueueEntry[]): QueueDisplayRow[] {
  const { calling, waiting } = getOperationalState(entries);
  const active = [...(calling ? [calling] : []), ...waiting];
  const inactive = entries
    .filter(e => ['AUSENTE', 'RETIRADO', 'SALIO'].includes(e.status))
    .sort((a, b) => a.position - b.position);
  return [
    ...active.map((entry, i) => ({ entry, displayPos: i + 1 })),
    ...inactive.map(entry => ({ entry, displayPos: null })),
  ];
}

export function getVehiclesAhead(entry: QueueEntry, allEntries: QueueEntry[]): number {
  // Importante: se apoya en getOperationalState (no en un simple sort por
  // "position" cruda) porque el admin puede llamar a una unidad fuera de su
  // orden de registro (p.ej. la #7 antes que la #1..#6). Si se ignora eso,
  // una unidad recien llamada segunda calculando "vehiculos por delante" con
  // su posicion cruda antigua, en vez de reflejar que ya le toca a ella.
  const { calling, waiting } = getOperationalState(allEntries);
  if (calling?.id === entry.id) return 0;
  const idx = waiting.findIndex(e => e.id === entry.id);
  if (idx < 0) return 0;
  return calling ? idx + 1 : idx;
}

/**
 * Traduce el estado crudo de una fila a la etiqueta operativa que se muestra en
 * pantalla, con su color. Etiqueta generica (no depende de una zona fisica de
 * terminal como "rampa" o "exterior", porque eso varia por asociacion) — el
 * numero de cada etiqueta coincide a proposito con el numero de "Pos."
 * (columna de getQueueDisplayOrder) para que ambos nunca se contradigan:
 * LLAMANDO = Pos. 1, EN COLA 2 = Pos. 2, EN COLA 3 = Pos. 3, y asi sucesivamente
 * sin limite fijo.
 */
export function getOperationalPosition(entry: QueueEntry, allEntries: QueueEntry[]): OperationalPosition {
  if (entry.status === 'AUSENTE') return { label: 'AUSENTE', filterKey: 'AUSENTE', className: 'bg-danger/10 text-danger' };
  if (entry.status === 'RETIRADO') return { label: 'RETIRADO', filterKey: 'RETIRADO', className: 'bg-t2/10 text-t2' };
  if (entry.status === 'SALIO') return { label: 'SALIÓ', filterKey: 'SALIO', className: 'bg-ok/10 text-ok' };

  const { calling, waiting } = getOperationalState(allEntries);
  if (calling?.id === entry.id) return { label: 'LLAMANDO', filterKey: 'LLAMANDO', className: 'bg-cyan-100 text-cyan-700' };

  const waitingIndex = waiting.findIndex(item => item.id === entry.id);
  if (waitingIndex < 0) {
    return { label: 'EN COLA', filterKey: 'EN_COLA', className: 'bg-primary/10 text-primary' };
  }
  // Jayde (3 sept 2026): el puesto 1 SIEMPRE es "Llamando" conceptualmente,
  // este ocupado o no -- nunca existe una etiqueta "EN COLA 1". El primero
  // en espera es "EN COLA 2", el segundo "EN COLA 3", etc. (Con la regla de
  // auto-Llamando en cola vacia, de todas formas casi nunca se ve una unidad
  // sola esperando -- pasa directo a Llamando al confirmar llegada.)
  return {
    label: 'EN COLA ' + (waitingIndex + 2),
    filterKey: 'EN_COLA',
    className: 'bg-primary/10 text-primary',
  };
}
