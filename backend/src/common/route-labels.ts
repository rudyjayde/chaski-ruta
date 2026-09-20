// Nombres de las dos rutas de una asociacion (ida y retorno), tal como las
// escribio el Super Admin en "Rutas habilitadas". Mismo criterio que
// routeLabel()/routeEnds() del frontend (src/lib/operacion-api.ts): si la
// asociacion no escribio sus rutas, se usan los nombres de sus terminales y,
// si tampoco los hay, "Ida" / "Retorno" -- nunca el corredor de otra asociacion.
export type RouteNamesConfig = {
  routeOriginName?: string | null;
  routeDestinationName?: string | null;
  returnOriginName?: string | null;
  returnDestinationName?: string | null;
  terminalOriginName?: string | null;
  terminalDestinationName?: string | null;
} | null | undefined;

const clean = (v?: string | null) => v?.trim() || '';

export function routeEnds(route: 'JULI_PUNO' | 'PUNO_JULI', c: RouteNamesConfig): { origin: string; destination: string } {
  const idaO = clean(c?.routeOriginName) || clean(c?.terminalOriginName);
  const idaD = clean(c?.routeDestinationName) || clean(c?.terminalDestinationName);
  if (route === 'JULI_PUNO') return { origin: idaO, destination: idaD };
  return { origin: clean(c?.returnOriginName) || idaD, destination: clean(c?.returnDestinationName) || idaO };
}

export function routeLabel(route: 'JULI_PUNO' | 'PUNO_JULI', c: RouteNamesConfig): string {
  const { origin, destination } = routeEnds(route, c);
  if (!origin || !destination) return route === 'JULI_PUNO' ? 'Ida' : 'Retorno';
  return `${origin} → ${destination}`;
}
