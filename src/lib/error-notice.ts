// Notificacion global "No se pudo completar la accion" (6 nov 2026, a pedido
// de Jayde): cualquier accion que no sale avisa con una ventana y un boton
// Aceptar, explicando el motivo. La dispara request() en operacion-api.ts para
// toda accion contra el backend; showErrorNotice() queda para los errores que
// no pasan por ahi (ej. el navegador no pudo obtener la ubicacion).
//
// La misma ventana se usa en verde para avisos positivos que requieren que el
// usuario haga algo a continuacion (ver showManifestFullNotice).
export interface Notice {
  tone: 'error' | 'success';
  title: string;
  message: string;
}

type Listener = (notice: Notice) => void;

let listener: Listener | null = null;

export function showErrorNotice(message: string) {
  listener?.({ tone: 'error', title: 'No se pudo completar la acción', message });
}

// Al registrar el ultimo asiento. Dice "cierra el manifiesto" y no "marca
// salida" porque el backend no deja salir con el manifiesto abierto.
export function showManifestFullNotice(capacity: number) {
  listener?.({
    tone: 'success',
    title: 'Manifiesto completo',
    message: `La unidad completó sus ${capacity} pasajeros. Cierra el manifiesto para poder marcar la salida.`,
  });
}

export function subscribeErrorNotice(fn: Listener) {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

// La sesion dejo de valer (cuenta suspendida o eliminada, token vencido): AuthContext la cierra.
export const SESSION_ENDED_EVENT = 'chaski:session-ended';

export const CONNECTION_ERROR = 'No se pudo conectar con el servidor. Revisa tu internet e inténtalo de nuevo.';

// Textos por defecto del servidor (en ingles, o sin explicacion). Los mensajes
// escritos por nosotros explican el motivo real y nunca se reemplazan.
const TECHNICAL_MESSAGE = /^(error \d+|internal server error|unauthorized|forbidden( resource)?|not found|bad request|conflict|too many requests|thrott?lerexception.*|cannot (get|post|patch|put|delete) .*|(request entity|payload) too large|bad gateway|service unavailable|gateway timeout)$/i;

export function friendlyErrorMessage(status: number, message: string): string {
  if (!TECHNICAL_MESSAGE.test(message.trim())) return message;
  if (status === 401) return 'Tu sesión venció. Vuelve a iniciar sesión e inténtalo de nuevo.';
  if (status === 403) return 'No tienes permiso para realizar esta acción.';
  if (status === 404) return 'Lo que intentas modificar ya no existe. Actualiza la página y revisa.';
  if (status === 409) return 'La información cambió mientras trabajabas. Actualiza la página y revisa.';
  if (status === 413) return 'El archivo es demasiado grande. Prueba con uno más liviano.';
  if (status === 429) return 'Hiciste demasiados intentos seguidos. Espera un momento y vuelve a intentarlo.';
  if (status >= 500) return 'Ocurrió un problema en el sistema. Inténtalo de nuevo en unos minutos y, si continúa, avisa a soporte.';
  return 'No se pudo procesar lo que enviaste. Revisa los datos e inténtalo de nuevo.';
}
