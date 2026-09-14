// Fecha calendario LOCAL (no UTC) en formato YYYY-MM-DD.
//
// new Date().toISOString().slice(0, 10) da el dia en UTC, no en Peru
// (UTC-5). Desde las 7pm hora de Lima en adelante, el dia en UTC ya
// cambio al dia siguiente aunque para el usuario todavia es "hoy" -- por
// eso el filtro "Hoy" del historial GPS no mostraba nada por las noches
// (12 sept 2026, reportado por Jayde). Usar siempre esta funcion -- nunca
// toISOString().slice(0, 10) -- para calcular "hoy"/"hace 7 dias" o para
// convertir una fecha-hora real (una salida, un fixTime de Traccar) al dia
// calendario que le corresponde para el usuario.
export function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
