// Celular o no, segun lo que el navegador dice de si mismo. El servidor usa la
// MISMA regla (backend/src/queues/queues.controller.ts): la inscripcion en cola
// solo se permite desde el celular registrado del conductor.
export const isMobileDevice = () =>
  typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(navigator.userAgent);
