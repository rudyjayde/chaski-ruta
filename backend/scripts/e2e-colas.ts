// Prueba de punta a punta de colas, viajes, manifiestos, reubicaciones y privacidad entre roles.
//
// Crea una asociacion de prueba ("ZZ E2E") con administrador, socios, conductores y unidades, ejecuta
// el ciclo real por la API (inscribirse, llamar, manifiesto, salir, regresar, candados, excepciones,
// reubicacion, aislamiento entre asociaciones) y AL FINAL LA BORRA. Repetirla antes de cada despliegue:
//
//   cd backend && npx ts-node --transpile-only scripts/e2e-colas.ts
//
// SOLO contra una base LOCAL: escribe y borra datos, asi que se niega a correr si DATABASE_URL no es
// localhost.
import * as fs from 'fs';
import * as path from 'path';
const envFile = path.join(__dirname, '..', '.env');
const dbUrl = process.env.DATABASE_URL ?? (fs.existsSync(envFile) ? (fs.readFileSync(envFile, 'utf8').match(/^DATABASE_URL="?([^"\r\n]+)/m)?.[1] ?? '') : '');
if (!/@(localhost|127\.0\.0\.1)[:\/]/.test(dbUrl)) {
  console.error('ABORTADO: esta prueba escribe datos y solo corre contra una base de datos local (localhost).');
  process.exit(1);
}

import 'reflect-metadata';
process.env.RESEND_API_KEY = '';
process.env.JWT_STATUS_CACHE_MS = '0'; // sin memoria: cada peticion revisa el estado real de la persona
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { JwtService } from '@nestjs/jwt';
import { GpsService } from '../src/gps/gps.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { validationExceptionFactory } from '../src/common/validation-messages';
import { hasValidRucCheckDigit } from '../src/common/validators';
import { routeLabel as routeLabelOf } from '../src/common/route-labels';

const JULI = { lat: -16.2035, lng: -69.4597 };
const PUNO = { lat: -15.8402, lng: -70.0219 };
const FAR = { lat: -12.0464, lng: -77.0428 }; // Lima
type Res = { status: number; json: any };
const results: { section: string; label: string; ok: boolean; detail: string }[] = [];
let section = '';
const check = (label: string, ok: boolean, detail = '') => {
  results.push({ section, label, ok, detail });
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${label}${detail ? ` — ${detail}` : ''}`);
};
const head = (name: string) => { section = name; console.log(`\n=== ${name}`); };
const msg = (r: Res) => (Array.isArray(r.json?.message) ? r.json.message.join('; ') : r.json?.message ?? '');

(async () => {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, exceptionFactory: validationExceptionFactory }));
  await app.listen(0);
  const base = (await app.getUrl()).replace('[::1]', 'localhost');
  const auth = app.get(AuthService);
  const prisma = app.get(PrismaService);

  let ipCounter = 1;
  const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36';
  const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36';
  const call = async (token: string, method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<Res> => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'User-Agent': MOBILE_UA, ...extraHeaders, 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Forwarded-For': `10.9.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  };

  const stamp = Date.now().toString().slice(-6);
  const orgIds: string[] = [];
  const mk = async (orgId: string, role: 'ADMINISTRADOR' | 'CONDUCTOR' | 'SOCIO', name: string, n: number) =>
    prisma.person.create({ data: { organizationId: orgId, name, email: `e2e.${stamp}.${orgId.slice(-4)}.${role[0]}${n}@example.test`, role, status: 'ACTIVO', dni: `9${stamp}${n}`.slice(0, 8) } });
  const tok = async (p: any) => (await auth.issueToken(p)).accessToken as string;

  try {
    // ───────── Preparacion: asociacion A (la que se prueba) y B (para aislamiento) ─────────
    const orgA = await prisma.organization.create({ data: { name: `ZZ E2E A ${stamp}`, ruc: `2099${stamp}9`.slice(0, 11), status: 'ACTIVA', plan: 'OPERACION' } });
    const orgB = await prisma.organization.create({ data: { name: `ZZ E2E B ${stamp}`, ruc: `2098${stamp}9`.slice(0, 11), status: 'ACTIVA', plan: 'OPERACION' } });
    orgIds.push(orgA.id, orgB.id);
    await prisma.operationalConfig.create({ data: { organizationId: orgA.id, enrollmentAuthRequired: false, terminalOriginLat: JULI.lat, terminalOriginLng: JULI.lng, terminalDestinationLat: PUNO.lat, terminalDestinationLng: PUNO.lng } });
    await prisma.operationalConfig.create({ data: { organizationId: orgB.id, enrollmentAuthRequired: false, terminalOriginLat: JULI.lat, terminalOriginLng: JULI.lng, terminalDestinationLat: PUNO.lat, terminalDestinationLng: PUNO.lng } });
    const coA = await prisma.company.create({ data: { organizationId: orgA.id, name: 'ZZ Empresa A' } });
    const coB = await prisma.company.create({ data: { organizationId: orgB.id, name: 'ZZ Empresa B' } });
    const adminA = await mk(orgA.id, 'ADMINISTRADOR', 'Admin A', 0);
    const adminB = await mk(orgB.id, 'ADMINISTRADOR', 'Admin B', 0);
    const partners = [] as any[];
    for (let i = 1; i <= 4; i++) partners.push(await mk(orgA.id, 'SOCIO', `Socio ${i}`, i));
    const drivers = [] as any[];
    const units = [] as any[];
    for (let i = 1; i <= 10; i++) {
      const d = await mk(orgA.id, 'CONDUCTOR', `Conductor ${i}`, i);
      drivers.push(d);
      units.push(await prisma.vehicle.create({ data: { organizationId: orgA.id, code: `E${stamp.slice(-3)}${i}`, companyId: coA.id, vehicleType: 'HIACE', plate: `E${i}${stamp.slice(-2)}-${stamp.slice(0, 3)}`, model: 'Toyota Hiace', year: 2024, partnerId: partners[Math.floor((Math.min(i, 8) - 1) / 2)].id, currentDriverId: d.id } }));
    }
    const driverB = await mk(orgB.id, 'CONDUCTOR', 'Conductor B', 1);
    const unitB = await prisma.vehicle.create({ data: { organizationId: orgB.id, code: `B${stamp.slice(-3)}`, companyId: coB.id, vehicleType: 'HIACE', plate: `EB${stamp.slice(-1)}-${stamp.slice(0, 3)}`, model: 'Toyota Hiace', year: 2024, currentDriverId: driverB.id } });
    const T = {
      admin: await tok(adminA), adminB: await tok(adminB), driverB: await tok(driverB),
      d: await Promise.all(drivers.map(tok)), p: await Promise.all(partners.map(tok)),
    };
    const u = units; // atajo
    const list = async (route: string, token = T.admin) => (await call(token, 'GET', `/queues/${route}`)).json as any[];
    const entryOf = async (route: string, unit: any) => (await list(route)).find((e) => e.vehicleId === unit.id);
    const join = (i: number, route: string, gps: { lat: number; lng: number } | null, extra: any = {}) =>
      call(T.d[i], 'POST', `/queues/${route}/join`, { vehicleId: u[i].id, deviceId: `dev-${i}`, ...(gps ?? {}), ...extra });
    const dispatch = async (i: number, route: string, pax = 2) => {
      await ensureCalled(i, route);
      const e = await entryOf(route, u[i]);
      const trip = await call(T.d[i], 'POST', `/queues/entries/${e.id}/prepare-trip`);
      const man = await call(T.d[i], 'POST', '/manifests', { tripId: trip.json.id, capacity: 19 });
      for (let s = 1; s <= pax; s++) await call(T.d[i], 'POST', `/manifests/${man.json.id}/passengers`, { name: `Pasajero ${s}`, dni: `1234567${s}`, seat: s, fare: 15, paymentMethod: 'EFECTIVO', origin: 'Juli', destination: 'Puno' });
      await call(T.d[i], 'POST', `/manifests/${man.json.id}/close`, pax === 0 ? { paperBackupConfirmed: true } : {});
      const dep = await call(T.d[i], 'POST', `/queues/entries/${e.id}/depart`);
      return { trip: trip.json, manifest: man.json, dep };
    };
    const backdate = async (tripId: string, minutes: number) => { if (!tripId) throw new Error('viaje sin id (falló abrir/preparar antes)'); return prisma.trip.update({ where: { id: tripId }, data: { actualDeparture: new Date(Date.now() - minutes * 60000) } }); };
    const ensureCalled = async (i: number, route: string) => { const e = await entryOf(route, u[i]); if (e && e.status === 'INSCRITO') await call(T.admin, 'POST', `/queues/entries/${e.id}/advance`, { toStatus: 'LLAMADO' }); };

    const wipeOps = async () => {
      const manIds = (await prisma.manifest.findMany({ where: { organizationId: orgA.id }, select: { id: true } })).map((m) => m.id);
      await prisma.passenger.deleteMany({ where: { manifestId: { in: manIds } } });
      await prisma.manifest.deleteMany({ where: { organizationId: orgA.id } });
      await prisma.trip.updateMany({ where: { organizationId: orgA.id }, data: { predecessorTripId: null } });
      await prisma.trip.deleteMany({ where: { organizationId: orgA.id } });
      await prisma.delayedRegistrationRequest.deleteMany({ where: { organizationId: orgA.id } });
      await prisma.queueEntry.deleteMany({ where: { organizationId: orgA.id } });
    };

    // ═════════ A. INSCRIPCION ═════════
    head('A. Inscripción en la cola (conductor)');
    let r = await join(0, 'JULI_PUNO', JULI);
    check('conductor 1 se inscribe en Juli→Puno (GPS en el terminal)', r.status === 201, `HTTP ${r.status} ${msg(r)}`);
    let q = await list('JULI_PUNO');
    check('cola vacía: la primera unidad pasa sola a LLAMADO', q[0]?.status === 'LLAMADO', `estado=${q[0]?.status}`);
    r = await join(1, 'JULI_PUNO', JULI);
    const r3 = await join(2, 'JULI_PUNO', JULI);
    q = await list('JULI_PUNO');
    check('segunda y tercera unidad quedan INSCRITO en orden 2 y 3', q.length === 3 && q[1].status === 'INSCRITO' && q[2].status === 'INSCRITO' && q[1].position === 2 && q[2].position === 3, q.map((e) => `${e.position}:${e.status}`).join(' '));
    r = await join(1, 'JULI_PUNO', JULI);
    check('inscribirse dos veces en la misma cola se rechaza', r.status === 400, `HTTP ${r.status} ${msg(r)}`);
    r = await join(0, 'PUNO_JULI', PUNO);
    check('una unidad no puede estar en las dos colas a la vez', r.status === 403, `HTTP ${r.status} ${msg(r)}`);
    r = await call(T.d[3], 'POST', '/queues/JULI_PUNO/join', { vehicleId: u[3].id, ...JULI });
    check('sin identificador de dispositivo se rechaza', r.status === 400, `HTTP ${r.status} ${msg(r)}`);
    r = await join(3, 'JULI_PUNO', null);
    check('sin ubicación del celular se rechaza', r.status === 400, `HTTP ${r.status} ${msg(r)}`);
    r = await join(3, 'JULI_PUNO', FAR);
    check('ubicación lejos del terminal se rechaza (radio)', r.status === 403, `HTTP ${r.status} ${msg(r)}`);
    await prisma.person.update({ where: { id: drivers[3].id }, data: { boundDeviceId: 'dev-3' } }); // ya tenia su celular registrado
    r = await call(T.d[3], 'POST', '/queues/JULI_PUNO/join', { vehicleId: u[3].id, deviceId: 'otro-celular', ...JULI });
    check('cuenta vinculada a otro celular se rechaza', r.status === 403, `HTTP ${r.status} ${msg(r)}`);
    r = await call(T.d[3], 'POST', '/queues/JULI_PUNO/join', { vehicleId: u[4].id, deviceId: 'dev-3', ...JULI });
    check('un conductor no puede inscribir la unidad de otro', r.status === 403, `HTTP ${r.status} ${msg(r)}`);
    r = await call(T.p[0], 'POST', '/queues/JULI_PUNO/join', { vehicleId: u[0].id, deviceId: 'x', ...JULI });
    check('un socio no puede inscribir unidades', r.status === 403, `HTTP ${r.status}`);
    r = await call(T.driverB, 'POST', '/queues/JULI_PUNO/join', { vehicleId: u[3].id, deviceId: 'x', ...JULI });
    check('un conductor de OTRA asociación no puede usar una unidad ajena', r.status === 404 || r.status === 403, `HTTP ${r.status} ${msg(r)}`);
    r = await call(T.adminB, 'POST', `/queues/entries/${q[1].id}/advance`, { toStatus: 'LLAMADO' });
    check('un administrador de OTRA asociación no puede mover la cola ajena', r.status === 404 || r.status === 403, `HTTP ${r.status}`);
    const qB = await list('JULI_PUNO', T.adminB);
    check('la cola de otra asociación no muestra unidades ajenas', qB.length === 0, `${qB.length} entradas`);

    // ═════════ B. ADMINISTRADOR ═════════
    head('B. Administrador sobre la cola');
    r = await call(T.admin, 'POST', `/queues/entries/${q[2].id}/advance`, { toStatus: 'LISTO' });
    check('no se puede saltar de INSCRITO a LISTO', r.status === 400, `HTTP ${r.status} ${msg(r)}`);
    r = await call(T.d[1], 'POST', `/queues/entries/${q[1].id}/advance`, { toStatus: 'LLAMADO' });
    check('un conductor no puede avanzar posiciones', r.status === 403, `HTTP ${r.status}`);
    r = await call(T.admin, 'POST', `/queues/entries/${q[0].id}/advance`, { toStatus: 'EN_TERMINAL' });
    check('el administrador avanza LLAMADO → EN_TERMINAL', r.status === 201, `HTTP ${r.status} ${msg(r)}`);
    r = await call(T.admin, 'POST', `/queues/entries/${q[0].id}/override`, { action: 'REQUEUE', reason: 'x' });
    check('la intervención exige un motivo de al menos 3 letras', r.status === 400, `HTTP ${r.status} ${msg(r)}`);
    // devolver la unidad 1 a LLAMADO para el ciclo de viaje (REQUEUE la manda al final y promueve a la siguiente)
    r = await call(T.admin, 'POST', `/queues/entries/${q[0].id}/override`, { action: 'REQUEUE', reason: 'prueba de reorden' });
    q = await list('JULI_PUNO');
    check('REQUEUE manda la unidad al final y la siguiente pasa a LLAMADO', q[0].vehicleId === u[1].id && q[0].status === 'LLAMADO' && q[2].vehicleId === u[0].id, q.map((e) => `${e.position}:${e.status}`).join(' '));

    // ═════════ C. CICLO DE VIAJE ═════════
    head('C. Ciclo de viaje: llamado → manifiesto → salida');
    const e1 = await entryOf('JULI_PUNO', u[1]);
    r = await call(T.d[2], 'POST', `/queues/entries/${q[1].id}/prepare-trip`);
    check('solo la unidad LLAMADA puede preparar su viaje', r.status === 400 || r.status === 403, `HTTP ${r.status} ${msg(r)}`);
    r = await call(T.d[1], 'POST', `/queues/entries/${e1.id}/depart`);
    check('no se puede marcar salida sin manifiesto', r.status === 400, `HTTP ${r.status} ${msg(r)}`);
    const trip = await call(T.d[1], 'POST', `/queues/entries/${e1.id}/prepare-trip`);
    check('LLAMADO prepara su viaje (PROGRAMADO)', trip.status === 201 && trip.json.status === 'PROGRAMADO', `HTTP ${trip.status} ${trip.json.status}`);
    const trip2 = await call(T.d[1], 'POST', `/queues/entries/${e1.id}/prepare-trip`);
    check('preparar dos veces reutiliza el mismo viaje', trip2.json.id === trip.json.id);
    const man = await call(T.d[1], 'POST', '/manifests', { tripId: trip.json.id, capacity: 19 });
    check('abre el manifiesto (BORRADOR)', man.status === 201 && man.json.status === 'BORRADOR', `HTTP ${man.status} ${msg(man)}`);
    r = await call(T.d[1], 'POST', `/manifests/${man.json.id}/close`, {});
    check('cerrar un manifiesto vacío sin respaldo en papel se rechaza', r.status === 400, `HTTP ${r.status} ${msg(r)}`);
    r = await call(T.d[1], 'POST', `/queues/entries/${e1.id}/depart`);
    check('no se puede salir con el manifiesto en BORRADOR', r.status === 400, `HTTP ${r.status} ${msg(r)}`);
    const okPax = await call(T.d[1], 'POST', `/manifests/${man.json.id}/passengers`, { name: 'Ana Perez', dni: '12345678', seat: 1, fare: 20, paymentMethod: 'YAPE', origin: 'Juli', destination: 'Puno' });
    check('agrega un pasajero con DNI', okPax.status === 201, `HTTP ${okPax.status} ${msg(okPax)}`);
    r = await call(T.d[1], 'POST', `/manifests/${man.json.id}/passengers`, { name: 'Extranjero Uno', dni: 'A12345678', documentType: 'CE', seat: 2, fare: 20, paymentMethod: 'EFECTIVO', origin: 'Juli', destination: 'Puno' });
    check('agrega un pasajero extranjero (carné de extranjería)', r.status === 201, `HTTP ${r.status} ${msg(r)}`);
    r = await call(T.d[1], 'POST', `/manifests/${man.json.id}/passengers`, { name: 'Repetido', dni: '87654321', seat: 1, fare: 20, paymentMethod: 'EFECTIVO', origin: 'Juli', destination: 'Puno' });
    check('un asiento ocupado no se repite', r.status === 400, `HTTP ${r.status} ${msg(r)}`);
    r = await call(T.d[1], 'POST', `/manifests/${man.json.id}/passengers`, { name: 'Fuera', dni: '87654321', seat: 30, fare: 20, paymentMethod: 'EFECTIVO', origin: 'Juli', destination: 'Puno' });
    check('un asiento fuera de la capacidad se rechaza', r.status === 400, `HTTP ${r.status} ${msg(r)}`);
    r = await call(T.d[1], 'POST', `/manifests/${man.json.id}/close`, {});
    check('cierra el manifiesto con pasajeros', r.status === 201 && r.json.status === 'CERRADO', `HTTP ${r.status} ${r.json.status ?? msg(r)}`);
    const dep = await call(T.d[1], 'POST', `/queues/entries/${e1.id}/depart`);
    check('marca salida: el viaje pasa a ACTIVO', dep.status === 201 && dep.json.status === 'ACTIVO', `HTTP ${dep.status} ${dep.json.status ?? msg(dep)}`);
    q = await list('JULI_PUNO');
    check('la unidad que salió deja la cola', !q.some((e) => e.vehicleId === u[1].id));
    check('REGLA: al salir, la siguiente unidad pasa sola a LLAMADO', q[0]?.status === 'LLAMADO', `la primera en cola quedó ${q[0]?.status ?? 'sin nadie'}`);

    // ═════════ D. VISIBILIDAD ENTRE ROLES ═════════
    head('D. Lo que ve cada rol (privacidad entre socios y conductores)');
    const myMan = (await call(T.p[0], 'GET', '/manifests')).json as any[]; // socio 1 es dueño de u0,u1
    const otherMan = (await call(T.p[1], 'GET', '/manifests')).json as any[]; // socio 2 dueño de u2,u3
    check('el socio dueño ve el manifiesto de su unidad', myMan.some((m) => m.id === man.json.id), `${myMan.length} manifiestos`);
    check('SEGURIDAD: otro socio NO debería ver manifiestos (con DNI de pasajeros) de unidades ajenas', !otherMan.some((m) => m.id === man.json.id), otherMan.some((m) => m.id === man.json.id) ? 'lo ve' : 'no lo ve');
    const otherDriverMan = (await call(T.d[5], 'GET', '/manifests')).json as any[];
    check('otro conductor no ve el manifiesto', !otherDriverMan.some((m) => m.id === man.json.id));
    const tripsAsPartner2 = (await call(T.p[1], 'GET', '/trips')).json as any[];
    check('SEGURIDAD: un socio solo debería ver viajes de SUS unidades', !tripsAsPartner2.some((t) => t.id === trip.json.id), tripsAsPartner2.some((t) => t.id === trip.json.id) ? 've el viaje de una unidad ajena' : '');
    const driverSeesTrips = (await call(T.d[5], 'GET', '/trips')).json as any[];
    const leakedDriver = driverSeesTrips.find((t) => t.id === trip.json.id)?.driver;
    check('SEGURIDAD: un conductor no debería ver DNI/celular/correo de otro conductor en /trips', !(leakedDriver && (leakedDriver.dni || leakedDriver.phone || leakedDriver.email)), leakedDriver ? `expone: ${['dni', 'phone', 'email'].filter((k) => leakedDriver[k]).join(', ')}` : '');
    const qAsDriver = (await call(T.d[5], 'GET', '/queues/JULI_PUNO')).json as any[];
    const leakQ = qAsDriver[0]?.driver;
    check('SEGURIDAD: la cola visible a un conductor no debería traer DNI/celular/correo de otros', !(leakQ && (leakQ.dni || leakQ.phone || leakQ.email)), leakQ ? `expone: ${['dni', 'phone', 'email'].filter((k) => leakQ[k]).join(', ')}` : '');
    const qAsPartner = (await call(T.p[3], 'GET', '/queues/JULI_PUNO')).json as any[];
    const leakP = qAsPartner[0]?.vehicle?.partner;
    check('SEGURIDAD: la cola visible a un socio no debería traer datos personales de otros socios', !(leakP && (leakP.dni || leakP.phone || leakP.email)), leakP ? `expone: ${['dni', 'phone', 'email'].filter((k) => leakP[k]).join(', ')}` : '');

    const vehAsDriver = (await call(T.d[5], 'GET', '/vehicles')).json as any[];
    const otherPartnerLeak = vehAsDriver.find((v) => v.partnerId && v.partnerId !== partners[2].id && v.partner && (v.partner.dni || v.partner.phone || v.partner.email));
    check('SEGURIDAD: la flota visible a un conductor no debería traer DNI/celular/correo de socios ajenos', !otherPartnerLeak, otherPartnerLeak ? 'expone datos de un socio' : '');
    const ownOk = vehAsDriver.find((v) => v.id === u[5].id);
    check('el conductor sí ve sus propios datos en su unidad', !!ownOk?.currentDriver?.dni);
    const vehAsPartner = (await call(T.p[0], 'GET', '/vehicles')).json as any[];
    const otherDrv = vehAsPartner.find((v) => v.currentDriverId && v.currentDriver && v.currentDriver.id !== T.p[0] && (v.currentDriver.dni || v.currentDriver.email));
    check('SEGURIDAD: la flota visible a un socio no debería traer DNI/correo de conductores ajenos', !otherDrv, otherDrv ? 'expone datos de un conductor' : '');

    // ═════════ E. REGRESO ═════════
    head('E. Regreso: tiempo mínimo, GPS y re-inscripción');
    r = await join(1, 'PUNO_JULI', PUNO);
    check('regresar antes del tiempo mínimo se rechaza', r.status === 403 && /Tiempo minimo/i.test(msg(r)), `HTTP ${r.status} ${msg(r)}`);
    await backdate(trip.json.id, 100);
    r = await join(1, 'PUNO_JULI', JULI);
    check('regresar con GPS lejos del terminal de Puno se rechaza', r.status === 403, `HTTP ${r.status} ${msg(r)}`);
    r = await join(1, 'JULI_PUNO', JULI);
    check('un viaje activo en la misma dirección bloquea inscribirse', r.status === 403, `HTTP ${r.status} ${msg(r)}`);
    r = await join(1, 'PUNO_JULI', PUNO);
    check('regresa: se inscribe en Puno→Juli y completa el viaje de ida', r.status === 201, `HTTP ${r.status} ${msg(r)}`);
    const tripAfter = (await call(T.admin, 'GET', `/trips/${trip.json.id}`)).json;
    check('el viaje de ida queda COMPLETADO', tripAfter.status === 'COMPLETADO', tripAfter.status);
    q = await list('PUNO_JULI');
    check('primera unidad en la cola de regreso pasa sola a LLAMADO', q[0]?.vehicleId === u[1].id && q[0]?.status === 'LLAMADO', `estado=${q[0]?.status}`);

    // ═════════ F. CANDADO DE PREDECESORES ═════════
    head('F. Orden real de salida (predecesores) e inscripción retrasada');
    // u4 sale primero, u5 sale despues; ambos "llegan"; u5 quiere volver antes que u4
    await prisma.queueEntry.deleteMany({ where: { organizationId: orgA.id } });
    for (const i of [4, 5]) { await join(i, 'JULI_PUNO', JULI); }
    const d4 = await dispatch(4, 'JULI_PUNO');
    // tras salir u4, u5 debe estar LLAMADO
    const d5 = await dispatch(5, 'JULI_PUNO');
    check('u4 y u5 salieron con manifiesto', d4.dep.status === 201 && d5.dep.status === 201, `HTTP ${d4.dep.status}/${d5.dep.status} ${msg(d4.dep)} ${msg(d5.dep)}`);
    await backdate(d4.trip.id, 200);
    await backdate(d5.trip.id, 190);
    await call(T.admin, 'POST', `/trips/${d4.trip.id}/complete`, {});
    r = await join(5, 'PUNO_JULI', PUNO);
    check('u5 (salió después) NO puede inscribirse antes que u4', r.status === 403 && /no se ha inscrito/i.test(msg(r)), `HTTP ${r.status} ${msg(r)}`);
    const dr = await call(T.d[5], 'POST', '/queues/delayed-registration', { route: 'PUNO_JULI' });
    check('u5 avisa "Inscripción retrasada"', dr.status === 201 && dr.json.status === 'PENDIENTE', `HTTP ${dr.status} ${dr.json.status ?? msg(dr)}`);
    const drList = (await call(T.admin, 'GET', '/queues/delayed-registration/list')).json as any[];
    check('el administrador ve la solicitud pendiente', drList.some((x) => x.id === dr.json.id && x.status === 'PENDIENTE'));
    const drDup = await call(T.d[5], 'POST', '/queues/delayed-registration', { route: 'PUNO_JULI' });
    check('avisar dos veces no duplica la solicitud', drDup.json.id === dr.json.id);
    r = await call(T.d[5], 'POST', `/queues/delayed-registration/${dr.json.id}/resolve`, { resolution: 'AUTORIZAR_DIRECTO' });
    check('un conductor no puede resolver la solicitud', r.status === 403, `HTTP ${r.status}`);
    r = await call(T.admin, 'POST', `/queues/delayed-registration/${dr.json.id}/resolve`, { resolution: 'AUTORIZAR_DIRECTO' });
    check('el administrador autoriza', r.status === 201 && r.json.status === 'AUTORIZADO', `HTTP ${r.status} ${r.json.status ?? msg(r)}`);
    r = await join(5, 'PUNO_JULI', PUNO);
    check('con la autorización, u5 se inscribe', r.status === 201, `HTTP ${r.status} ${msg(r)}`);
    const drAfter = ((await call(T.admin, 'GET', '/queues/delayed-registration/list')).json as any[]).find((x) => x.id === dr.json.id);
    check('la autorización queda consumida (RESUELTO)', drAfter?.status === 'RESUELTO', drAfter?.status);
    r = await join(4, 'PUNO_JULI', PUNO);
    check('u4 (el predecesor) también puede inscribirse después', r.status === 201, `HTTP ${r.status} ${msg(r)}`);
    check('REGLA: u4 llegó tarde (u5 ya fue autorizada antes) y el sistema se lo avisa (entra al final)', r.json.movedToEnd === true, `movedToEnd=${r.json.movedToEnd}`);
    const qLate = await list('PUNO_JULI');
    check('REGLA: u4 quedó al FINAL de la cola, detrás de u5 (aunque salió antes)', qLate.length >= 2 && qLate[qLate.length - 1].vehicleId === u[4].id && qLate.findIndex((e) => e.vehicleId === u[5].id) < qLate.findIndex((e) => e.vehicleId === u[4].id), qLate.map((e) => (e.vehicleId === u[4].id ? 'u4' : e.vehicleId === u[5].id ? 'u5' : '?')).join(' '));

    head('F2. "No saldré ahora" libera al que viene detrás');
    await wipeOps();
    // u6 sale primero, u7 despues. u6 se inscribe de vuelta y luego dice "no saldré ahora". u7 debe poder inscribirse.
    await prisma.queueEntry.deleteMany({ where: { organizationId: orgA.id } });
    await join(6, 'JULI_PUNO', JULI); await join(7, 'JULI_PUNO', JULI);
    const d6 = await dispatch(6, 'JULI_PUNO');
    const d7 = await dispatch(7, 'JULI_PUNO');
    await backdate(d6.trip.id, 200); await backdate(d7.trip.id, 190);
    const j6 = await join(6, 'PUNO_JULI', PUNO);
    check('u6 se inscribe de vuelta', j6.status === 201, `HTTP ${j6.status} ${msg(j6)}`);
    const e6 = await entryOf('PUNO_JULI', u[6]);
    const later = await call(T.d[6], 'POST', `/queues/entries/${e6.id}/declare-later`);
    check('u6 presiona "No saldré ahora" (sale de la cola)', later.status === 201 && later.json.withdrawn === true, `HTTP ${later.status} ${msg(later)}`);
    r = await join(7, 'PUNO_JULI', PUNO);
    check('REGLA: tras "No saldré ahora" de u6, u7 debe poder inscribirse', r.status === 201, `HTTP ${r.status} ${msg(r)}`);

    head('F3. Un viaje de ayer no bloquea a los de hoy');
    await wipeOps();
    await join(7, 'JULI_PUNO', JULI);
    const d8 = await dispatch(7, 'JULI_PUNO');
    await backdate(d8.trip.id, 33 * 60);
    await call(T.admin, 'POST', `/trips/${d8.trip.id}/complete`, {});
    await join(8, 'JULI_PUNO', JULI);
    const d9 = await dispatch(8, 'JULI_PUNO');
    await backdate(d9.trip.id, 100);
    r = await join(8, 'PUNO_JULI', PUNO);
    check('REGLA: una unidad que llegó hace más de una jornada y no volvió no bloquea a las de hoy', r.status === 201, `HTTP ${r.status} ${msg(r)}`);

    // ═════════ G. INTERVENCIONES DEL ADMINISTRADOR ═════════
    head('G. Intervención manual: ausente / retirado / reordenar');
    await wipeOps();
    // dejar JULI_PUNO limpio via override RETIRADO y luego probar con tres unidades nuevas (u0,u2,u3)
    for (const e of await list('JULI_PUNO')) await call(T.admin, 'POST', `/queues/entries/${e.id}/override`, { action: 'RETIRADO', reason: 'limpieza prueba' });
    await prisma.queueEntry.deleteMany({ where: { organizationId: orgA.id, route: 'JULI_PUNO' } });
    for (const i of [2, 3, 8]) await join(i, 'JULI_PUNO', JULI);
    q = await list('JULI_PUNO');
    check('preparación: tres unidades en cola, la primera LLAMADA', q.length === 3 && q[0].status === 'LLAMADO', q.map((e) => `${e.position}:${e.status}`).join(' '));
    r = await call(T.admin, 'POST', `/queues/entries/${q[0].id}/override`, { action: 'AUSENTE', reason: 'no se presentó' });
    q = await list('JULI_PUNO');
    check('REGLA: si la unidad LLAMADA es marcada AUSENTE, la siguiente pasa sola a LLAMADO', q.some((e) => e.status === 'LLAMADO'), q.map((e) => `${e.vehicleId === u[2].id ? 'u2' : e.vehicleId === u[3].id ? 'u3' : 'u8'}:${e.status}`).join(' '));
    r = await join(2, 'JULI_PUNO', JULI);
    check('REGLA: una unidad marcada AUSENTE puede volver a inscribirse', r.status === 201, `HTTP ${r.status} ${msg(r)}`);

    q = await list('JULI_PUNO');
    const llamado = q.find((e) => e.status === 'LLAMADO');
    if (llamado) {
      await call(T.admin, 'POST', `/queues/entries/${llamado.id}/override`, { action: 'RETIRADO', reason: 'retiro por prueba' });
      q = await list('JULI_PUNO');
      check('REGLA: si la unidad LLAMADA es RETIRADA, la siguiente pasa sola a LLAMADO', q.some((e) => e.status === 'LLAMADO' && e.id !== llamado.id), q.map((e) => e.status).join(' '));
    }

    // ═════════ H. REUBICACION ═════════
    head('H. Reubicación (administrador decide, conductor se inscribe con orden verificada)');
    await wipeOps();
    await prisma.queueEntry.deleteMany({ where: { organizationId: orgA.id } });
    const ord = await call(T.admin, 'POST', '/relocations', { fromTerminal: 'JULI', toTerminal: 'PUNO', reason: 'Desbalance de demanda', windowLabel: 'Hoy 14:00', compensation: 'Vacío sin cobro', vehicleIds: [u[9].id] });
    check('crea la orden de reubicación', ord.status === 201, `HTTP ${ord.status} ${msg(ord)}`);
    r = await call(T.d[9], 'POST', '/queues/PUNO_JULI/join', { vehicleId: u[9].id, deviceId: 'dev-9', ...PUNO, isRelocation: true });
    check('sin orden autorizada, la casilla "reubicación" no salta los candados', r.status === 403, `HTTP ${r.status} ${msg(r)}`);
    r = await call(T.admin, 'POST', `/relocations/${ord.json.id}/authorize`);
    check('autoriza', r.status === 201 && r.json.status === 'AUTORIZADA', `HTTP ${r.status} ${msg(r)}`);
    r = await call(T.d[9], 'POST', `/relocations/${ord.json.id}/units/${u[9].id}/accept`);
    check('el conductor acepta participar', r.status === 201, `HTTP ${r.status} ${msg(r)}`);
    r = await call(T.d[8], 'POST', `/relocations/${ord.json.id}/units/${u[9].id}/accept`);
    check('otro conductor no puede aceptar por él', r.status === 403, `HTTP ${r.status}`);
    r = await call(T.admin, 'POST', `/relocations/${ord.json.id}/start`);
    check('inicia el traslado', r.status === 201 && r.json.status === 'EN_TRASLADO', `HTTP ${r.status} ${msg(r)}`);
    r = await call(T.d[9], 'POST', '/queues/JULI_PUNO/join', { vehicleId: u[9].id, deviceId: 'dev-9', ...JULI, isRelocation: true });
    check('la orden Juli→Puno NO vale para inscribirse otra vez en Juli', r.status === 403, `HTTP ${r.status} ${msg(r)}`);
    r = await call(T.d[9], 'POST', '/queues/PUNO_JULI/join', { vehicleId: u[9].id, deviceId: 'dev-9', ...JULI, isRelocation: true });
    check('con la orden EN_TRASLADO pero lejos del terminal de Puno se rechaza (GPS)', r.status === 403, `HTTP ${r.status} ${msg(r)}`);
    r = await call(T.d[9], 'POST', '/queues/PUNO_JULI/join', { vehicleId: u[9].id, deviceId: 'dev-9', ...PUNO, isRelocation: true });
    check('REGLA: con la orden EN_TRASLADO, la unidad llega a Puno y se inscribe en Puno→Juli', r.status === 201, `HTTP ${r.status} ${msg(r)}`);
    const ordB = await call(T.adminB, 'POST', '/relocations', { fromTerminal: 'PUNO', toTerminal: 'JULI', reason: 'Desbalance de demanda', windowLabel: 'Hoy', compensation: 'Vacío', vehicleIds: [unitB.id] });
    check('REGLA: la primera orden de OTRA asociación se crea sin chocar con la numeración (antes error 500)', ordB.status === 201, `HTTP ${ordB.status} ${msg(ordB)}`);
    r = await call(T.admin, 'POST', `/relocations/${ord.json.id}/complete`);
    check('completa la reubicación', r.status === 201 && r.json.status === 'COMPLETADA', `HTTP ${r.status} ${msg(r)}`);

    // ═════════ I. UNIDADES QUE NO DEBERIAN OPERAR ═════════
    head('I. Unidades desactivadas o dadas de baja no deben inscribirse');
    await wipeOps();
    await prisma.queueEntry.deleteMany({ where: { organizationId: orgA.id } });
    await call(T.admin, 'POST', `/vehicles/${u[3].id}/deactivate`, { reason: 'En taller' });
    r = await join(3, 'PUNO_JULI', PUNO);
    check('REGLA: una unidad DESACTIVADA (taller) no debería poder inscribirse en la cola', r.status >= 400, `HTTP ${r.status} ${r.status === 201 ? 'SE INSCRIBIÓ' : msg(r)}`);
    await prisma.queueEntry.deleteMany({ where: { organizationId: orgA.id } });
    await call(T.admin, 'POST', `/vehicles/${u[8].id}/retire`, { reason: 'Vendida o fuera de servicio' });
    r = await call(T.admin, 'POST', '/queues/PUNO_JULI/join', { vehicleId: u[8].id, ...PUNO });
    check('REGLA: una unidad DADA DE BAJA no debería poder ser inscrita ni por el administrador', r.status >= 400, `HTTP ${r.status} ${r.status === 201 ? 'SE INSCRIBIÓ' : msg(r)}`);

    // ═════════ K. QA 20 sept: documento CE, categoría de licencia, licencia vencida, código automático ═════════
    head('K. Documento de conductor, categoría de licencia, licencia vencida y código automático');
    const ceOk = await call(T.admin, 'POST', '/people', { name: 'Conductor Extranjero', email: `e2e.${stamp}.ce@example.test`, role: 'CONDUCTOR', documentType: 'CE', dni: 'AB1234567', phone: '987654321' });
    check('conductor con carné de extranjería (CE) válido se registra', ceOk.status === 201, `HTTP ${ceOk.status} ${msg(ceOk)}`);
    const ceBad = await call(T.admin, 'POST', '/people', { name: 'Conductor CE malo', email: `e2e.${stamp}.cebad@example.test`, role: 'CONDUCTOR', documentType: 'CE', dni: 'AB1' });
    check('CE con formato inválido se rechaza', ceBad.status === 400, `HTTP ${ceBad.status} ${msg(ceBad)}`);
    const catBad = await call(T.admin, 'POST', '/people', { name: 'Conductor cat mala', email: `e2e.${stamp}.catbad@example.test`, role: 'CONDUCTOR', dni: '87651234', license: 'Q12345678', licenseCategory: 'Z-9', licenseIssuedAt: '2024-01-01', licenseExpiry: '2030-01-01' });
    check('una categoría de licencia fuera del catálogo se rechaza', catBad.status === 400, `HTTP ${catBad.status} ${msg(catBad)}`);

    const noCode = await call(T.admin, 'POST', '/vehicles', { companyId: coA.id, vehicleType: 'HIACE', plate: `ZZ${stamp.slice(-1)}-001`, model: 'Toyota Hiace', year: 2024 });
    check('el código de unidad es obligatorio (nunca se asigna solo)', noCode.status === 400, `HTTP ${noCode.status} ${msg(noCode)}`);
    const manV1 = await call(T.admin, 'POST', '/vehicles', { code: '061', companyId: coA.id, vehicleType: 'HIACE', plate: `ZZ${stamp.slice(-1)}-001`, model: 'Toyota Hiace', year: 2024 });
    check('el administrador registra la unidad con SU código', manV1.status === 201 && manV1.json.code === '061', `HTTP ${manV1.status} ${msg(manV1)} código=${manV1.json.code}`);
    const manV2 = await call(T.admin, 'POST', '/vehicles', { code: '061', companyId: coA.id, vehicleType: 'HIACE', plate: `ZZ${stamp.slice(-1)}-002`, model: 'Toyota Hiace', year: 2024 });
    check('repetir el código en la misma asociación se rechaza con mensaje claro', manV2.status === 409 && /061/.test(msg(manV2)), `HTTP ${manV2.status} ${msg(manV2)}`);

    const otroV = await call(T.admin, 'POST', '/vehicles', { code: 'K03', companyId: coA.id, vehicleType: 'OTRO', plate: `ZZ${stamp.slice(-1)}-003`, model: 'Kia Grand Carnival', year: 2024 });
    check('una unidad con marca "Otro" (texto libre) se registra', otroV.status === 201 && otroV.json.vehicleType === 'OTRO' && otroV.json.model === 'Kia Grand Carnival', `HTTP ${otroV.status} ${msg(otroV)} tipo=${otroV.json.vehicleType}`);
    const wrongType = await call(T.admin, 'POST', '/vehicles', { code: 'K04', companyId: coA.id, vehicleType: 'MASTER', plate: `ZZ${stamp.slice(-1)}-004`, model: 'Toyota Hiace', year: 2024 });
    check('marca del catálogo con tipo que no corresponde se sigue rechazando', wrongType.status === 400, `HTTP ${wrongType.status} ${msg(wrongType)}`);
    const catA4 = await call(T.admin, 'POST', '/people', { name: 'Conductor Categoria A4', email: `e2e.${stamp}.a4@example.test`, role: 'CONDUCTOR', dni: '87651235', license: 'Q12345679', licenseCategory: 'A-IV', licenseIssuedAt: '2024-01-01', licenseExpiry: '2030-01-01' });
    check('la categoría A-IV (materiales peligrosos) se acepta', catA4.status === 201, `HTTP ${catA4.status} ${msg(catA4)}`);
    const catA1 = await call(T.admin, 'POST', '/people', { name: 'Conductor Categoria A1', email: `e2e.${stamp}.a1@example.test`, role: 'CONDUCTOR', dni: '87651236', license: 'Q12345680', licenseCategory: 'A-I', licenseIssuedAt: '2024-01-01', licenseExpiry: '2030-01-01' });
    check('la categoría A-I también se acepta (catálogo completo de la clase A)', catA1.status === 201, `HTTP ${catA1.status} ${msg(catA1)}`);
    const dirOrgs = ((await call(T.d[0], 'GET', '/organizations/directory')).json as any[]).find((o) => o.id === orgA.id);
    check('el directorio público de asociaciones trae la dirección completa de cada terminal', dirOrgs && 'terminalOriginAddress' in dirOrgs && 'terminalDestinationAddress' in dirOrgs, dirOrgs ? Object.keys(dirOrgs).join(',') : 'la asociación no aparece');

    const expDriver = await mk(orgA.id, 'CONDUCTOR', 'Conductor Vencido', 99);
    const expVehicle = await prisma.vehicle.create({ data: { organizationId: orgA.id, code: `EXV${stamp.slice(-2)}`, companyId: coA.id, vehicleType: 'HIACE', plate: `EX${stamp.slice(-1)}-999`, model: 'Toyota Hiace', year: 2024, currentDriverId: expDriver.id } });
    await prisma.person.update({ where: { id: expDriver.id }, data: { license: 'Q99999999', licenseCategory: 'A-IIIa', licenseIssuedAt: new Date('2020-01-01'), licenseExpiry: new Date('2021-01-01') } });
    const expTok = await tok(expDriver);
    const joinExpired = await call(expTok, 'POST', '/queues/JULI_PUNO/join', { vehicleId: expVehicle.id, deviceId: 'dev-exp', ...JULI });
    check('REGLA: una licencia vencida no puede inscribirse en la cola', joinExpired.status === 403 && /venci/i.test(msg(joinExpired)), `HTTP ${joinExpired.status} ${msg(joinExpired)}`);
    await prisma.person.update({ where: { id: expDriver.id }, data: { licenseExpiry: new Date(Date.now() + 365 * 86400000) } });
    const joinRenewed = await call(expTok, 'POST', '/queues/JULI_PUNO/join', { vehicleId: expVehicle.id, deviceId: 'dev-exp', ...JULI });
    check('con la licencia renovada, la unidad ya se puede inscribir', joinRenewed.status === 201, `HTTP ${joinRenewed.status} ${msg(joinRenewed)}`);

    // ═════════ L. ELIMINAR ASOCIACION COMPLETA (baja, historial se conserva) ═════════
    head('L. Eliminar una asociación completa');
    const superP = await prisma.person.create({ data: { organizationId: null, name: 'Super E2E', email: `e2e.${stamp}.super@example.test`, role: 'SUPERADMIN', status: 'ACTIVO' } });
    const TS = await tok(superP);
    await join(0, 'JULI_PUNO', JULI);
    r = await call(TS, 'POST', `/organizations/${orgA.id}/delete`, { reason: 'prueba' });
    check('no se puede eliminar una asociación con unidades en cola', r.status === 409, `HTTP ${r.status} ${msg(r)}`);
    await prisma.queueEntry.deleteMany({ where: { organizationId: orgA.id } });
    r = await call(T.adminB, 'POST', `/organizations/${orgB.id}/delete`, { reason: 'x' });
    check('un administrador NO puede eliminar su asociación (solo Super Admin)', r.status === 403, `HTTP ${r.status}`);
    r = await call(TS, 'POST', `/organizations/${orgB.id}/delete`, {});
    check('eliminar exige un motivo', r.status === 400, `HTTP ${r.status} ${msg(r)}`);
    r = await call(TS, 'POST', `/organizations/${orgB.id}/delete`, { reason: 'la asociación dejó el servicio' });
    check('el Super Admin elimina la asociación con motivo', r.status === 201 && r.json.ok === true, `HTTP ${r.status} ${msg(r)}`);
    const listAfter = (await call(TS, 'GET', '/organizations')).json as any[];
    check('la asociación eliminada ya no aparece en el listado', !listAfter.some((o) => o.id === orgB.id) && listAfter.some((o) => o.id === orgA.id));
    const dirAfter = (await call(T.d[0], 'GET', '/organizations/directory')).json as any[];
    check('tampoco aparece en el portal (directorio)', !dirAfter.some((o) => o.id === orgB.id));
    const kept = await prisma.vehicle.count({ where: { organizationId: orgB.id } });
    const orgBRow = await prisma.organization.findUnique({ where: { id: orgB.id } });
    check('REGLA: sus datos se conservan (unidades, asociación) con estado ELIMINADA', kept === 1 && orgBRow?.status === 'ELIMINADA', `unidades=${kept} estado=${orgBRow?.status}`);
    const stillActive = await prisma.person.count({ where: { organizationId: orgB.id, status: { not: 'SUSPENDIDO' } } });
    check('todas sus cuentas quedan suspendidas', stillActive === 0, `${stillActive} activas`);
    const aud = await prisma.auditEntry.count({ where: { organizationId: orgB.id, action: 'ELIMINAR_ASOCIACION' } });
    check('queda registrada en Auditoría con el motivo', aud === 1, `${aud} registros`);
    r = await call(TS, 'POST', `/organizations/${orgB.id}/delete`, { reason: 'otra vez' });
    check('eliminar dos veces se rechaza', r.status === 409, `HTTP ${r.status} ${msg(r)}`);
    // Volver a crear con los MISMOS datos: debe quedar como si nunca hubiera existido
    let ruc = '';
    for (let n = 0; n < 1000 && !ruc; n++) {
      const c = `20${stamp}${String(n).padStart(3, '0')}`.slice(0, 10);
      for (let d = 0; d < 10; d++) if (hasValidRucCheckDigit(`${c}${d}`)) { ruc = `${c}${d}`; break; }
    }
    const orgC = await prisma.organization.create({ data: { name: `ZZ E2E C ${stamp}`, ruc, status: 'ACTIVA', plan: 'PRO' } });
    orgIds.push(orgC.id);
    await prisma.operationalConfig.create({ data: { organizationId: orgC.id, enrollmentAuthRequired: false, terminalOriginLat: JULI.lat, terminalOriginLng: JULI.lng, terminalDestinationLat: PUNO.lat, terminalDestinationLng: PUNO.lng } });
    const coC = await prisma.company.create({ data: { organizationId: orgC.id, name: 'ZZ Empresa C' } });
    const adminC = await mk(orgC.id, 'ADMINISTRADOR', 'Admin C', 0);
    const drvC = await mk(orgC.id, 'CONDUCTOR', 'Conductor C', 1);
    await prisma.person.update({ where: { id: drvC.id }, data: { license: 'Q55555555', licenseCategory: 'A-IIIa', whatsappPhone: `9${stamp}77` } });
    await prisma.vehicle.create({ data: { organizationId: orgC.id, code: '001', companyId: coC.id, vehicleType: 'HIACE', plate: 'ABC-123', model: 'Toyota Hiace', year: 2024, currentDriverId: drvC.id, traccarDeviceId: `IMEI-E2E-${stamp}` } });
    r = await call(TS, 'POST', `/organizations/${orgC.id}/delete`, { reason: 'prueba de recreación' });
    check('se elimina la asociación C (con RUC, GPS, licencia y WhatsApp)', r.status === 201, `HTTP ${r.status} ${msg(r)}`);
    const cAfter = await prisma.organization.findUnique({ where: { id: orgC.id } });
    check('su historial sigue ahí (asociación, personas y unidades)', !!cAfter && (await prisma.person.count({ where: { organizationId: orgC.id } })) === 2 && (await prisma.vehicle.count({ where: { organizationId: orgC.id } })) === 1);
    r = await call(TS, 'POST', '/organizations', { name: `ZZ E2E C nueva ${stamp}`, ruc, adminName: 'Admin C Nuevo', adminEmail: adminC.email, plan: 'PRO', terminalOriginName: 'Juli', terminalDestinationName: 'Puno' });
    check('REGLA: se puede crear otra asociación con el MISMO RUC y el MISMO correo de administrador', r.status === 201, `HTTP ${r.status} ${msg(r)}`);
    if (r.json.id) orgIds.push(r.json.id);
    const newC = r.json.id as string;
    const newAdmin = newC ? await prisma.person.findFirst({ where: { organizationId: newC, role: 'ADMINISTRADOR' } }) : null;
    const T2 = newAdmin ? await tok(newAdmin) : '';
    const newCo = newC ? (await call(TS, 'POST', `/companies?organizationId=${newC}`, { name: 'ZZ Empresa C' })).json : ({} as any);
    r = await call(T2, 'POST', '/vehicles', { code: '001', companyId: newCo.id, vehicleType: 'HIACE', plate: 'ABC-123', model: 'Toyota Hiace', year: 2024 });
    check('la nueva asociación puede registrar la MISMA placa y el MISMO código 001 (cada asociación con su numeración)', r.status === 201 && r.json.code === '001', `HTTP ${r.status} ${msg(r)} codigo=${r.json.code}`);
    r = await call(T2, 'POST', '/people', { name: 'Conductor C Nuevo', email: drvC.email, role: 'CONDUCTOR', dni: '87651299', license: 'Q55555555', licenseCategory: 'A-IIIa', licenseIssuedAt: '2024-01-01', licenseExpiry: '2030-01-01' });
    check('puede registrar al mismo conductor (mismo correo y misma licencia) como si fuera nuevo', r.status === 201, `HTTP ${r.status} ${msg(r)}`);
    const newVeh = newC ? await prisma.vehicle.findFirst({ where: { organizationId: newC } }) : null;
    const reuseGps = newVeh ? await prisma.vehicle.update({ where: { id: newVeh.id }, data: { traccarDeviceId: `IMEI-E2E-${stamp}` } }).then(() => true).catch(() => false) : false;
    check('el mismo equipo GPS se puede volver a usar en la asociación nueva', reuseGps);
    const nuevaVacia = newC ? (await prisma.trip.count({ where: { organizationId: newC } })) + (await prisma.manifest.count({ where: { organizationId: newC } })) : -1;
    check('la asociación nueva arranca sin viajes ni manifiestos del historial anterior', nuevaVacia === 0, `${nuevaVacia}`);
    // Rutas habilitadas con nombre propio (distinto del nombre del terminal)
    const rn = await call(TS, 'POST', '/organizations', { name: `ZZ E2E R ${stamp}`, ruc: '20100070970', adminName: 'Admin R', adminEmail: `e2e.${stamp}.rutas@example.test`, terminalOriginName: 'Terminal Zonal Puno', terminalDestinationName: 'Terminal Zonal Juliaca', routeOriginName: 'Puno', routeDestinationName: 'Juliaca', returnOriginName: 'Juliaca', returnDestinationName: 'Puno' });
    if (rn.json.id) orgIds.push(rn.json.id);
    check('se crea una asociación con nombre de terminal Y nombre de ruta por separado', rn.status === 201, `HTTP ${rn.status} ${msg(rn)}`);
    if (rn.json.id) await prisma.organization.update({ where: { id: rn.json.id }, data: { status: 'ACTIVA' } });
    const dirR = ((await call(T.d[0], 'GET', '/organizations/directory')).json as any[]).find((o) => o.id === rn.json.id);
    check('el directorio trae terminal ("Terminal Zonal Puno") y ruta ("Puno") por separado', !!dirR && dirR.terminalOriginName === 'Terminal Zonal Puno' && dirR.routeOriginName === 'Puno' && dirR.routeDestinationName === 'Juliaca' && dirR.returnOriginName === 'Juliaca' && dirR.returnDestinationName === 'Puno', dirR ? JSON.stringify({ t: dirR.terminalOriginName, r: dirR.routeOriginName }) : 'sin asociación (¿estado?)');
    const rnAdmin = await prisma.person.findFirst({ where: { organizationId: rn.json.id, role: 'ADMINISTRADOR' } });
    if (rnAdmin) await prisma.person.update({ where: { id: rnAdmin.id }, data: { status: 'ACTIVO' } });
    const meR = rnAdmin ? (await call(await tok(rnAdmin), 'GET', '/organizations/me')).json : {};
    check('"Tu asociación" (/organizations/me) trae las dos rutas: ida y retorno', meR.routeOriginName === 'Puno' && meR.routeDestinationName === 'Juliaca' && meR.returnOriginName === 'Juliaca' && meR.returnDestinationName === 'Puno', JSON.stringify({ i: `${meR.routeOriginName}>${meR.routeDestinationName}`, r: `${meR.returnOriginName}>${meR.returnDestinationName}` }));
    const upd = await call(TS, 'POST', `/operational-config?organizationId=${rn.json.id}`, { routeOriginName: 'Puno Centro' });
    check('el Super Admin puede cambiar el nombre de la ruta sin tocar el del terminal', upd.status === 201 && upd.json.routeOriginName === 'Puno Centro' && upd.json.terminalOriginName === 'Terminal Zonal Puno', `HTTP ${upd.status} ${msg(upd)}`);
    // ─ Eliminar personas (administrador / socio / conductor) ─
    const pe = (email: string, role: string, extra: any = {}) => call(TS, 'POST', `/people?organizationId=${orgA.id}`, { name: 'Persona Prueba', email, role, ...extra });
    const admEmail = `e2e.${stamp}.eladm@example.test`;
    const a1 = await pe(admEmail, 'ADMINISTRADOR');
    check('se registra un administrador adicional', a1.status === 201, `HTTP ${a1.status} ${msg(a1)}`);
    r = await call(T.admin, 'POST', `/people/${a1.json.id}/delete`, { reason: 'x' });
    check('un administrador NO puede eliminar a otro administrador (solo Super Admin)', r.status === 403, `HTTP ${r.status} ${msg(r)}`);
    r = await call(TS, 'POST', `/people/${a1.json.id}/delete?organizationId=${orgA.id}`, {});
    check('eliminar exige motivo', r.status === 400, `HTTP ${r.status}`);
    r = await call(TS, 'POST', `/people/${a1.json.id}/delete?organizationId=${orgA.id}`, { reason: 'ya no trabaja' });
    check('el Super Admin elimina al administrador', r.status === 201, `HTTP ${r.status} ${msg(r)}`);
    const plist = (await call(T.admin, 'GET', '/people')).json as any[];
    check('el eliminado ya no aparece en Personas', !plist.some((x) => x.id === a1.json.id));
    const oldRow = await prisma.person.findUnique({ where: { id: a1.json.id } });
    check('su registro se conserva (estado ELIMINADO)', oldRow?.status === 'ELIMINADO' && oldRow.email.startsWith(admEmail), `${oldRow?.status}`);
    const a2 = await pe(admEmail, 'ADMINISTRADOR', { name: 'Admin Nuevo' });
    check('REGLA: con el mismo correo se crea una cuenta NUEVA (otro registro, pendiente)', a2.status === 201 && a2.json.id !== a1.json.id && a2.json.status === 'PENDIENTE', `HTTP ${a2.status} ${msg(a2)}`);
    r = await call(TS, 'POST', `/people/${a1.json.id}/delete?organizationId=${orgA.id}`, { reason: 'otra vez' });
    check('eliminar dos veces se rechaza', r.status === 404, `HTTP ${r.status}`);

    r = await call(T.admin, 'POST', `/people/${drivers[3].id}/delete`, { reason: 'prueba' });
    check('no se elimina a un conductor con unidad asignada', r.status === 409, `HTTP ${r.status} ${msg(r)}`);
    r = await call(T.admin, 'POST', `/people/${partners[3].id}/delete`, { reason: 'prueba' });
    check('no se elimina a un socio con unidades a su nombre', r.status === 409, `HTTP ${r.status} ${msg(r)}`);
    r = await call(T.admin, 'POST', `/people/${adminA.id}/delete`, { reason: 'yo' });
    check('nadie se elimina a sí mismo', r.status === 403, `HTTP ${r.status}`);
    const dEmail = `e2e.${stamp}.eldrv@example.test`;
    const drvN1 = await call(T.admin, 'POST', '/people', { name: 'Conductor Libre', email: dEmail, role: 'CONDUCTOR', dni: '87651277', license: 'Q77777777', licenseCategory: 'A-IIIa', licenseIssuedAt: '2024-01-01', licenseExpiry: '2030-01-01' });
    check('el administrador registra un conductor', drvN1.status === 201, `HTTP ${drvN1.status} ${msg(drvN1)}`);
    r = await call(T.admin, 'POST', `/people/${drvN1.json.id}/delete`, { reason: 'renunció' });
    check('el administrador SÍ puede eliminar a un conductor sin unidad', r.status === 201, `HTTP ${r.status} ${msg(r)}`);
    const drvN2 = await call(T.admin, 'POST', '/people', { name: 'Conductor Libre', email: dEmail, role: 'CONDUCTOR', dni: '87651277', license: 'Q77777777', licenseCategory: 'A-IIIa', licenseIssuedAt: '2024-01-01', licenseExpiry: '2030-01-01' });
    check('REGLA: se vuelve a registrar el mismo conductor (mismo correo, DNI y licencia) como nuevo', drvN2.status === 201 && drvN2.json.id !== drvN1.json.id, `HTTP ${drvN2.status} ${msg(drvN2)}`);
    // ─ Cada asociación muestra SUS rutas, nunca las de otra ─
    check('sin rutas ni terminales escritos, la etiqueta es "Ida"/"Retorno" (nunca Juli/Puno)', routeLabelOf('JULI_PUNO', { terminalOriginName: '', terminalDestinationName: '' }) === 'Ida' && routeLabelOf('PUNO_JULI', null) === 'Retorno');
    check('con las rutas escritas, ida y retorno salen tal cual', routeLabelOf('JULI_PUNO', { routeOriginName: 'Puno', routeDestinationName: 'Juliaca', returnOriginName: 'Juliaca', returnDestinationName: 'Puno' }) === 'Puno → Juliaca' && routeLabelOf('PUNO_JULI', { routeOriginName: 'Puno', routeDestinationName: 'Juliaca', returnOriginName: 'Juliaca', returnDestinationName: 'Puno' }) === 'Juliaca → Puno');
    let ruc2 = '';
    for (let d = 0; d < 10 && !ruc2; d++) if (hasValidRucCheckDigit(`2011111111${d}`)) ruc2 = `2011111111${d}`;
    const bare = await call(TS, 'POST', '/organizations', { name: `ZZ E2E S ${stamp}`, ruc: ruc2, adminName: 'Admin S', adminEmail: `e2e.${stamp}.sinrutas@example.test` });
    if (bare.json.id) { orgIds.push(bare.json.id); await prisma.organization.update({ where: { id: bare.json.id }, data: { status: 'ACTIVA' } }); }
    const bareDir = ((await call(T.d[0], 'GET', '/organizations/directory')).json as any[]).find((o) => o.id === bare.json.id);
    check('una asociación nueva sin nombres arranca vacía (no hereda "Juli"/"Puno")', bare.status === 201 && !!bareDir && bareDir.terminalOriginName === '' && bareDir.terminalDestinationName === '', bareDir ? JSON.stringify({ t: bareDir.terminalOriginName }) : `HTTP ${bare.status} ${msg(bare)}`);
    await call(TS, 'POST', `/operational-config?organizationId=${orgA.id}`, { routeOriginName: 'Puno', routeDestinationName: 'Juliaca', returnOriginName: 'Juliaca', returnDestinationName: 'Puno' });
    await wipeOps();
    await join(4, 'JULI_PUNO', JULI);
    const dxx = await dispatch(4, 'JULI_PUNO');
    const tokenV = 'atp_' + Buffer.from(`${dxx.manifest.id}|${dxx.manifest.number}|${u[4].code}`).toString('base64url');
    const ver = await call(T.d[0], 'GET', `/manifests-public/verify/${tokenV}`);
    check('la verificación pública del manifiesto usa el nombre de ruta de SU asociación', ver.status === 200 && ver.json.routeLabel === 'Puno → Juliaca', `HTTP ${ver.status} ${ver.json.routeLabel ?? msg(ver)}`);
    // ─ Celular registrado: solo se registra si la inscripcion sale bien, y solo desde un celular ─
    const dvD = await mk(orgA.id, 'CONDUCTOR', 'Conductor Celular', 77);
    const dvV = await prisma.vehicle.create({ data: { organizationId: orgA.id, code: 'DV77', companyId: coA.id, vehicleType: 'HIACE', plate: `DV${stamp.slice(-1)}-777`, model: 'Toyota Hiace', year: 2024, currentDriverId: dvD.id } });
    const dvT = await tok(dvD);
    const joinDv = (deviceId: string, gps: any, ua?: string) => call(dvT, 'POST', '/queues/JULI_PUNO/join', { vehicleId: dvV.id, deviceId, ...gps }, ua ? { 'User-Agent': ua } : {});
    const boundOf = async () => (await prisma.person.findUnique({ where: { id: dvD.id } }))?.boundDeviceId ?? null;
    r = await joinDv('laptop-1', JULI, DESKTOP_UA);
    check('desde una computadora NO se puede inscribir en la cola (mensaje: usa tu celular registrado)', r.status === 403 && /celular/i.test(msg(r)), `HTTP ${r.status} ${msg(r)}`);
    check('la computadora NO queda registrada por ese intento', (await boundOf()) === null);
    r = await joinDv('phone-1', FAR);
    check('desde el celular pero lejos del terminal se rechaza por GPS', r.status === 403 && /radio/i.test(msg(r)), `HTTP ${r.status} ${msg(r)}`);
    check('REGLA: un intento fallido por GPS NO ata el celular a la cuenta', (await boundOf()) === null);
    r = await joinDv('phone-1', JULI);
    check('desde el celular, en el terminal, se inscribe', r.status === 201, `HTTP ${r.status} ${msg(r)}`);
    check('recién ahí el celular queda registrado a la cuenta', (await boundOf()) === 'phone-1');
    await call(T.admin, 'POST', `/queues/entries/${(await entryOf('JULI_PUNO', dvV)).id}/override`, { action: 'RETIRADO', reason: 'prueba de celular' });
    r = await joinDv('phone-2', JULI);
    check('otro celular distinto al registrado se rechaza (pide reasignar)', r.status === 403 && /no es tu celular registrado/i.test(msg(r)), `HTTP ${r.status} ${msg(r)}`);
    r = await joinDv('phone-1', JULI, DESKTOP_UA);
    check('aunque tenga celular registrado, desde la computadora tampoco inscribe', r.status === 403 && /celular/i.test(msg(r)), `HTTP ${r.status}`);
    r = await call(T.admin, 'POST', '/queues/JULI_PUNO/join', { vehicleId: dvV.id, ...JULI }, { 'User-Agent': DESKTOP_UA });
    check('el administrador SÍ puede inscribir por el conductor desde una computadora', r.status === 201, `HTTP ${r.status} ${msg(r)}`);
    await prisma.queueEntry.deleteMany({ where: { organizationId: orgA.id, vehicleId: dvV.id } });

    // ─ Asociación nueva SIN coordenadas: los conductores no pueden inscribirse ─
    if (bare.json.id) {
      const bareDrv = await mk(bare.json.id, 'CONDUCTOR', 'Conductor Sin Mapa', 5);
      const bareCo = await prisma.company.create({ data: { organizationId: bare.json.id, name: 'ZZ Emp S' } });
      const bareVeh = await prisma.vehicle.create({ data: { organizationId: bare.json.id, code: '001', companyId: bareCo.id, vehicleType: 'HIACE', plate: 'SM1-001', model: 'Toyota Hiace', year: 2024, currentDriverId: bareDrv.id } });
      const bareCfg = await prisma.operationalConfig.findUnique({ where: { organizationId: bare.json.id } });
      check('una asociación nueva nace SIN coordenadas (no hereda las de Juli/Puno)', bareCfg?.terminalOriginLat === null && bareCfg?.terminalDestinationLng === null, JSON.stringify({ lat: bareCfg?.terminalOriginLat }));
      r = await call(await tok(bareDrv), 'POST', '/queues/JULI_PUNO/join', { vehicleId: bareVeh.id, deviceId: 'phone-x', ...JULI });
      check('sin terminales en el mapa, el conductor no puede inscribirse y ve un mensaje claro', r.status === 400 && /todavia no tienen ubicacion/i.test(msg(r)), `HTTP ${r.status} ${msg(r)}`);
      check('ese intento tampoco ata el celular', (await prisma.person.findUnique({ where: { id: bareDrv.id } }))?.boundDeviceId === null);
    }
    // ─ "Llegada sin confirmar": solo informativo, con tiempo maximo configurado por el Super Admin ─
    const ovTrip = await prisma.trip.create({ data: { organizationId: orgA.id, vehicleId: dvV.id, driverId: dvD.id, route: 'JULI_PUNO', status: 'ACTIVO', scheduledDeparture: new Date(Date.now() - 30 * 60000), actualDeparture: new Date(Date.now() - 30 * 60000), scheduledArrival: new Date(Date.now() + 60000) } as any });
    const tripOf = async () => ((await call(T.admin, 'GET', '/trips')).json as any[]).find((t) => t.id === ovTrip.id);
    let tv = await tripOf();
    check('sin tiempo máximo configurado, ningún viaje aparece como "llegada sin confirmar"', tv && tv.arrivalUnconfirmed === false, JSON.stringify({ f: tv?.arrivalUnconfirmed }));
    r = await call(T.admin, 'POST', '/operational-config', { maxTripMinutesOutbound: 10 });
    check('un administrador NO puede cambiar el tiempo máximo (solo Super Admin)', r.status === 403, `HTTP ${r.status}`);
    r = await call(TS, 'POST', `/operational-config?organizationId=${orgA.id}`, { maxTripMinutesOutbound: 10 });
    check('el Super Admin configura el tiempo máximo esperado', r.status === 201 && r.json.maxTripMinutesOutbound === 10, `HTTP ${r.status} ${msg(r)}`);
    tv = await tripOf();
    check('pasado el tiempo máximo, el viaje en curso aparece como "llegada sin confirmar" (con minutos de retraso)', tv?.arrivalUnconfirmed === true && tv.overdueMinutes >= 19 && tv.status === 'ACTIVO', JSON.stringify({ f: tv?.arrivalUnconfirmed, m: tv?.overdueMinutes }));
    check('es solo informativo: el viaje sigue ACTIVO y nada se bloquea ni se cierra', tv?.status === 'ACTIVO');
    const dvTrips = ((await call(dvT, 'GET', '/trips')).json as any[]).find((t) => t.id === ovTrip.id);
    check('el conductor también ve su viaje como "llegada sin confirmar"', dvTrips?.arrivalUnconfirmed === true);
    r = await call(TS, 'POST', `/operational-config?organizationId=${orgA.id}`, { maxTripMinutesOutbound: null });
    tv = await tripOf();
    check('con el tiempo máximo en blanco vuelve a no aparecer', r.status === 201 && tv?.arrivalUnconfirmed === false, `HTTP ${r.status} ${msg(r)}`);
    await prisma.trip.delete({ where: { id: ovTrip.id } });
    await prisma.person.delete({ where: { id: superP.id } }).catch(() => null);

    // ═════════ N. SESIONES YA ABIERTAS ═════════
    head('N. Sesiones ya abiertas');
    const sesP = await mk(orgA.id, 'CONDUCTOR', 'Sesion Prueba', 88);
    const sesT = await tok(sesP);
    r = await call(sesT, 'GET', '/people/me');
    check('una persona activa con sesión abierta entra normalmente', r.status === 200, `HTTP ${r.status}`);
    await prisma.person.update({ where: { id: sesP.id }, data: { status: 'SUSPENDIDO' } });
    r = await call(sesT, 'GET', '/people/me');
    check('al suspenderla, su sesión ya abierta deja de funcionar (401)', r.status === 401, `HTTP ${r.status}`);
    await prisma.person.update({ where: { id: sesP.id }, data: { status: 'ACTIVO' } });
    r = await call(sesT, 'GET', '/people/me');
    check('al reactivarla, la misma sesión vuelve a funcionar', r.status === 200, `HTTP ${r.status}`);
    await prisma.person.update({ where: { id: sesP.id }, data: { status: 'ELIMINADO' } });
    r = await call(sesT, 'GET', '/people/me');
    check('al eliminarla, su sesión ya abierta deja de funcionar (401)', r.status === 401, `HTTP ${r.status}`);
    await prisma.person.delete({ where: { id: sesP.id } });
    r = await call(sesT, 'GET', '/people/me');
    check('si la persona ya no existe, su sesión no sirve (401)', r.status === 401, `HTTP ${r.status}`);
    await prisma.organization.update({ where: { id: orgA.id }, data: { status: 'ELIMINADA' } });
    r = await call(T.admin, 'GET', '/people/me');
    check('al eliminar la asociación, las sesiones de sus usuarios dejan de funcionar (401)', r.status === 401, `HTTP ${r.status}`);
    await prisma.organization.update({ where: { id: orgA.id }, data: { status: 'ACTIVA' } });
    r = await call(T.admin, 'GET', '/people/me');
    check('con la asociación activa otra vez, el administrador vuelve a entrar', r.status === 200, `HTTP ${r.status}`);
    const jwtSvc = app.get(JwtService);
    const resetLike = jwtSvc.sign({ purpose: 'reset-password', email: 'x@example.test' });
    r = await call(resetLike, 'GET', '/manifests');
    check('un enlace de restablecer contraseña NO sirve como sesión (401)', r.status === 401, `HTTP ${r.status}`);
    const visitorTok = jwtSvc.sign({ sub: 'visitante-falso', role: 'VISITOR', email: 'v@example.test' });
    r = await call(visitorTok, 'GET', '/visitor-auth/me');
    check('la sesión de un visitante de la landing sigue funcionando', r.status === 200, `HTTP ${r.status}`);
    r = await call(visitorTok, 'GET', '/people/me');
    check('y un visitante no entra a rutas de personas (rol)', r.status === 403 || r.status === 401, `HTTP ${r.status}`);

    // ═════════ O. GPS DEL VEHICULO SIN SEÑAL: PEDIR USAR EL GPS DEL CELULAR ═════════
    head('O. GPS del vehículo sin señal');
    const gpsSvc = app.get(GpsService) as any;
    const realTraccarFetch = gpsSvc.traccarFetch;
    const gDev = `e2e-gps-${stamp}`;
    const traccar = { down: false, lastUpdateMinAgo: 0, fixMinAgo: 0, valid: true, at: JULI };
    gpsSvc.traccarFetch = async (path: string) => {
      if (traccar.down) throw new Error('Traccar caido (simulado)');
      if (path === '/api/devices') {
        return [{ id: 9001, uniqueId: gDev, name: 'GPS prueba', status: 'online', lastUpdate: new Date(Date.now() - traccar.lastUpdateMinAgo * 60000).toISOString() }];
      }
      return [{ deviceId: 9001, latitude: traccar.at.lat, longitude: traccar.at.lng, speed: 0, course: 0, valid: traccar.valid, fixTime: new Date(Date.now() - traccar.fixMinAgo * 60000).toISOString() }];
    };
    const setHw = (o: Partial<typeof traccar>) => Object.assign(traccar, { down: false, lastUpdateMinAgo: 0, fixMinAgo: 0, valid: true, at: JULI }, o);

    const gD = await mk(orgA.id, 'CONDUCTOR', 'Conductor GPS', 66);
    const gV = await prisma.vehicle.create({ data: { organizationId: orgA.id, code: 'GP66', companyId: coA.id, vehicleType: 'HIACE', plate: `GP${stamp.slice(-1)}-666`, model: 'Toyota Hiace', year: 2024, currentDriverId: gD.id, traccarDeviceId: gDev } });
    const gT = await tok(gD);
    const gJoin = (gps: { lat: number; lng: number } | null) => call(gT, 'POST', '/queues/JULI_PUNO/join', { vehicleId: gV.id, deviceId: 'gps-dev-1', ...(gps ?? {}) });
    const gClean = () => prisma.queueEntry.deleteMany({ where: { organizationId: orgA.id, vehicleId: gV.id } });
    const adminPerson = await prisma.person.findFirst({ where: { organizationId: orgA.id, role: 'ADMINISTRADOR' } });
    // Usuarios propios de esta seccion: el Super Admin de la seccion I ya se borro, y la asociacion B ya se elimino
    // (sus sesiones, con razon, ya no sirven).
    const superO = await prisma.person.create({ data: { organizationId: null, name: 'Super E2E O', email: `e2e.${stamp}.supero@example.test`, role: 'SUPERADMIN', status: 'ACTIVO' } });
    const TSO = await tok(superO);
    const orgO = await prisma.organization.create({ data: { name: `ZZ E2E O ${stamp}`, ruc: `2098${stamp}9`.slice(0, 11), status: 'ACTIVA', plan: 'PRO' } });
    orgIds.push(orgO.id);
    const adminO = await mk(orgO.id, 'ADMINISTRADOR', 'Admin Otra Asociacion', 55);
    const TAO = await tok(adminO);

    setHw({});
    r = await gJoin(JULI);
    check('con el GPS del vehículo reportando ahora mismo, el conductor se inscribe normal', r.status === 201, `HTTP ${r.status} ${msg(r)}`);
    await gClean();

    setHw({ fixMinAgo: 3, lastUpdateMinAgo: 3 });
    r = await gJoin(JULI);
    check('una señal de hace 3 min (dentro de los 5 permitidos) todavía sirve', r.status === 201, `HTTP ${r.status} ${msg(r)}`);
    await gClean();

    setHw({ fixMinAgo: 40, lastUpdateMinAgo: 40 });
    r = await gJoin(JULI);
    check('con el equipo sin reportar hace 40 min, NO se acepta ni con el celular en el terminal (sin autorización)', r.status === 403 && /no tiene señal/i.test(msg(r)), `HTTP ${r.status} ${msg(r)}`);
    r = await call(gT, 'GET', '/queues/gps-fallback/mine');
    check('el conductor ve que su GPS no tiene señal y que aún no pidió autorización', r.status === 200 && r.json.applies === true && r.json.noSignal === true && r.json.request === null, JSON.stringify(r.json));

    setHw({ down: true });
    r = await gJoin(JULI);
    check('si el servidor Traccar no responde tampoco se acepta el celular por su cuenta (403)', r.status === 403, `HTTP ${r.status} ${msg(r)}`);
    setHw({ fixMinAgo: 40, lastUpdateMinAgo: 40 });

    setHw({ fixMinAgo: 500, lastUpdateMinAgo: 500, at: JULI });
    r = await call(gT, 'POST', '/queues/gps-fallback');
    check('el conductor pide autorizar el GPS del celular (queda PENDIENTE)', r.status === 201 && r.json.status === 'PENDIENTE', `HTTP ${r.status} ${msg(r)}`);
    const req1 = r.json;
    r = await call(gT, 'POST', '/queues/gps-fallback');
    check('pedirlo dos veces no duplica la solicitud', r.status === 201 && r.json.id === req1.id, `HTTP ${r.status}`);
    r = await gJoin(JULI);
    check('mientras la solicitud está pendiente, sigue sin poder inscribirse (403)', r.status === 403, `HTTP ${r.status}`);
    const notif = await prisma.notice.count({ where: { targetPersonId: adminPerson!.id, title: 'GPS del vehiculo sin señal' } });
    check('el administrador recibe el aviso de la solicitud', notif >= 1, `${notif} avisos`);
    r = await call(T.admin, 'GET', '/queues/gps-fallback/list');
    check('el administrador ve la solicitud en su lista', r.status === 200 && r.json.some((x: any) => x.id === req1.id && x.status === 'PENDIENTE'), `HTTP ${r.status}`);
    r = await call(gT, 'POST', `/queues/gps-fallback/${req1.id}/resolve`, { approve: true });
    check('el conductor NO puede autorizarse a sí mismo (403)', r.status === 403, `HTTP ${r.status}`);
    r = await call(TAO, 'POST', `/queues/gps-fallback/${req1.id}/resolve`, { approve: true });
    check('el administrador de OTRA asociación no puede resolverla (404)', r.status === 404, `HTTP ${r.status}`);
    r = await call(T.admin, 'POST', `/queues/gps-fallback/${req1.id}/resolve`, {});
    check('resolver sin decir si autoriza o rechaza da error (400)', r.status === 400, `HTTP ${r.status}`);

    r = await call(T.admin, 'POST', `/queues/gps-fallback/${req1.id}/resolve`, { approve: true });
    const hoursLeft = r.json.authorizedUntil ? (new Date(r.json.authorizedUntil).getTime() - Date.now()) / 3600000 : 0;
    check('el administrador autoriza: queda AUTORIZADO por unas 24 h', r.status === 201 && r.json.status === 'AUTORIZADO' && hoursLeft > 23 && hoursLeft <= 24, `HTTP ${r.status} ${hoursLeft.toFixed(1)} h`);
    check('el conductor recibe el aviso de que fue autorizado', (await prisma.notice.count({ where: { targetPersonId: gD.id, title: 'GPS del celular autorizado' } })) >= 1);
    r = await gJoin(FAR);
    check('autorizado, el celular igual debe estar en el terminal: desde lejos se rechaza (403 por radio)', r.status === 403 && /radio|lejos|fuera/i.test(msg(r)), `HTTP ${r.status} ${msg(r)}`);
    r = await gJoin(null);
    check('autorizado pero SIN ubicación del celular no se inscribe (400)', r.status === 400, `HTTP ${r.status} ${msg(r)}`);
    r = await gJoin(JULI);
    check('autorizado y con el celular en el terminal, se inscribe', r.status === 201, `HTTP ${r.status} ${msg(r)}`);
    const gEntry = await prisma.queueEntry.findFirst({ where: { organizationId: orgA.id, vehicleId: gV.id } });
    check('la inscripción queda con evidencia de presencia en el terminal', gEntry?.evidence === 'PRESENCIA_TERMINAL', gEntry?.evidence);
    const gAudit = await prisma.auditEntry.findFirst({ where: { organizationId: orgA.id, action: 'INSCRIPCION_COLA', resourceId: gEntry?.id } });
    check('Auditoría deja escrito que se usó el GPS del celular autorizado', /GPS del celular autorizado/.test(gAudit?.reason ?? ''), gAudit?.reason ?? '');
    await gClean();

    setHw({});
    r = await call(gT, 'GET', '/queues/gps-fallback/mine');
    const exp1 = await prisma.gpsFallbackRequest.findUnique({ where: { id: req1.id } });
    check('cuando el equipo vuelve a reportar, el conductor ve que ya tiene señal', r.status === 200 && r.json.noSignal === false, JSON.stringify(r.json));
    check('y la autorización termina sola (EXPIRADO)', exp1?.status === 'EXPIRADO', exp1?.status);
    setHw({ fixMinAgo: 60, lastUpdateMinAgo: 60 });
    r = await gJoin(JULI);
    check('si el equipo vuelve a fallar, la autorización anterior ya no sirve (403)', r.status === 403, `HTTP ${r.status}`);

    r = await call(gT, 'POST', '/queues/gps-fallback');
    const req2 = r.json;
    r = await call(T.admin, 'POST', `/queues/gps-fallback/${req2.id}/resolve`, { approve: false });
    check('el administrador puede rechazar la solicitud', r.status === 201 && r.json.status === 'RECHAZADO', `HTTP ${r.status} ${msg(r)}`);
    r = await gJoin(JULI);
    check('rechazada, el conductor sigue sin poder inscribirse (403)', r.status === 403, `HTTP ${r.status}`);
    r = await call(T.admin, 'POST', `/queues/gps-fallback/${req2.id}/resolve`, { approve: true });
    check('una solicitud ya resuelta no se puede volver a resolver (400)', r.status === 400, `HTTP ${r.status}`);

    r = await call(T.admin, 'POST', '/queues/JULI_PUNO/join', { vehicleId: gV.id, ...JULI });
    check('un administrador puede inscribir la unidad aunque el equipo no tenga señal (excepción de siempre)', r.status === 201, `HTTP ${r.status} ${msg(r)}`);
    await gClean();

    for (let i = 0; i < 2; i++) {
      const q = await call(gT, 'POST', '/queues/gps-fallback');
      await call(T.admin, 'POST', `/queues/gps-fallback/${q.json.id}/resolve`, { approve: false });
    }
    const q4 = await call(gT, 'POST', '/queues/gps-fallback');
    const rep = await prisma.auditEntry.findFirst({ where: { organizationId: orgA.id, action: 'SOLICITAR_GPS_CELULAR', resourceId: q4.json.id } });
    check('a la 4.ª solicitud en 7 días queda marcada como repetida en Auditoría', /ATENCION/.test(rep?.reason ?? ''), rep?.reason ?? '');
    r = await call(T.admin, 'GET', '/queues/gps-fallback/list');
    check('y la lista del administrador muestra cuántas solicitudes lleva esa unidad', r.status === 200 && r.json.find((x: any) => x.id === q4.json.id)?.requestsLast7Days >= 4, JSON.stringify(r.json.find((x: any) => x.id === q4.json.id)?.requestsLast7Days));
    await prisma.gpsFallbackRequest.deleteMany({ where: { vehicleId: gV.id } });

    setHw({});
    r = await call(gT, 'POST', '/queues/gps-fallback');
    check('con el GPS del vehículo funcionando no se puede pedir autorización (400)', r.status === 400, `HTTP ${r.status} ${msg(r)}`);
    r = await call(T.d[0], 'POST', '/queues/gps-fallback');
    check('una unidad sin GPS vinculado no puede pedirla (400)', r.status === 400, `HTTP ${r.status} ${msg(r)}`);

    r = await call(T.admin, 'POST', '/operational-config', { gpsMaxAgeMinutes: 2 });
    check('un administrador NO puede cambiar la antigüedad máxima de la señal (solo Super Admin)', r.status === 403, `HTTP ${r.status}`);
    r = await call(TSO, 'POST', `/operational-config?organizationId=${orgA.id}`, { gpsMaxAgeMinutes: 0 });
    check('la antigüedad máxima debe ser de al menos 1 minuto (400)', r.status === 400, `HTTP ${r.status}`);
    r = await call(TSO, 'POST', `/operational-config?organizationId=${orgA.id}`, { gpsMaxAgeMinutes: 2 });
    check('el Super Admin la puede cambiar', r.status === 201 && r.json.gpsMaxAgeMinutes === 2, `HTTP ${r.status} ${msg(r)}`);
    setHw({ fixMinAgo: 3, lastUpdateMinAgo: 3 });
    r = await gJoin(JULI);
    check('con el límite en 2 min, una señal de hace 3 min ya cuenta como sin señal (403)', r.status === 403, `HTTP ${r.status}`);
    await call(TSO, 'POST', `/operational-config?organizationId=${orgA.id}`, { gpsMaxAgeMinutes: 5 });
    await gClean();
    gpsSvc.traccarFetch = realTraccarFetch;
    await prisma.person.delete({ where: { id: superO.id } }).catch(() => null);

    // ═════════ P. UNIDAD SIN HISTORIAL: DETECTAR EL TERMINAL Y EXIGIR ESTAR AHI ═════════
    head('P. Unidad sin historial y terminal detectado');
    const pD = await mk(orgA.id, 'CONDUCTOR', 'Conductor Sin Historial', 44);
    const pV = await prisma.vehicle.create({ data: { organizationId: orgA.id, code: 'PD44', companyId: coA.id, vehicleType: 'HIACE', plate: `PD${stamp.slice(-1)}-444`, model: 'Toyota Hiace', year: 2024, currentDriverId: pD.id } });
    const pT = await tok(pD);
    const pJoin = (route: string, gps: { lat: number; lng: number }) => call(pT, 'POST', `/queues/${route}/join`, { vehicleId: pV.id, deviceId: 'nohist-dev', ...gps });
    const detect = (token: string, gps: { lat: number; lng: number }) => call(token, 'GET', `/queues/detect/terminal?lat=${gps.lat}&lng=${gps.lng}`);

    r = await detect(pT, JULI);
    check('con el celular en el primer terminal se detecta la ruta que sale de ahí', r.status === 200 && r.json.route === 'JULI_PUNO' && r.json.terminalName === 'Juli', JSON.stringify(r.json));
    r = await detect(pT, PUNO);
    check('con el celular en el segundo terminal se detecta la ruta de retorno', r.status === 200 && r.json.route === 'PUNO_JULI' && r.json.terminalName === 'Puno', JSON.stringify(r.json));
    r = await detect(pT, FAR);
    check('lejos de los dos terminales no se detecta ninguno (route null)', r.status === 200 && r.json.route === null, JSON.stringify(r.json));
    r = await call(pT, 'GET', '/queues/detect/terminal?lat=abc&lng=1');
    check('una ubicación inválida da error (400)', r.status === 400, `HTTP ${r.status}`);
    r = await detect(T.admin, JULI);
    check('solo el conductor usa la detección (administrador 403)', r.status === 403, `HTTP ${r.status}`);
    const pO = await mk(orgO.id, 'CONDUCTOR', 'Conductor Otra Asoc', 43);
    r = await detect(await tok(pO), JULI);
    check('una asociación sin terminales en el mapa no detecta nada (route null)', r.status === 200 && r.json.route === null, JSON.stringify(r.json));

    r = await pJoin('PUNO_JULI', JULI);
    check('sin historial, elegir Puno → Juli estando en Juli se rechaza por distancia al terminal de PUNO (403, con su nombre)', r.status === 403 && /terminal Puno/.test(msg(r)) && /radio/.test(msg(r)), `HTTP ${r.status} ${msg(r)}`);
    r = await pJoin('JULI_PUNO', PUNO);
    check('y elegir Juli → Puno estando en Puno se rechaza mencionando el terminal Juli (403)', r.status === 403 && /terminal Juli/.test(msg(r)), `HTTP ${r.status} ${msg(r)}`);
    r = await pJoin('PUNO_JULI', PUNO);
    check('con la exigencia de autorización apagada, sin historial y en el terminal de Puno se inscribe directo en Puno → Juli', r.status === 201, `HTTP ${r.status} ${msg(r)}`);
    const pPos = await prisma.queueEntry.findFirst({ where: { organizationId: orgA.id, route: 'PUNO_JULI', vehicleId: pV.id } });
    const lastRegistered = await prisma.queueEntry.findMany({ where: { organizationId: orgA.id, route: 'PUNO_JULI', status: { notIn: ['AUSENTE', 'RETIRADO'] } }, orderBy: { position: 'desc' }, take: 1 });
    check('queda registrada al final de la cola (sin hora de salida anterior)', !!pPos && lastRegistered[0]?.id === pPos.id, `pos ${pPos?.position}`);
    await prisma.queueEntry.deleteMany({ where: { organizationId: orgA.id, vehicleId: pV.id } });

    // ═════════ Q. AUTORIZACIONES DE INSCRIPCION (sin historial / historial que no calza) ═════════
    head('Q. Autorizaciones de inscripción');
    await prisma.operationalConfig.update({ where: { organizationId: orgA.id }, data: { enrollmentAuthRequired: true } });
    const qD = await mk(orgA.id, 'CONDUCTOR', 'Rudy Prueba', 33);
    const qV = await prisma.vehicle.create({ data: { organizationId: orgA.id, code: 'QA33', companyId: coA.id, vehicleType: 'HIACE', plate: `QA${stamp.slice(-1)}-333`, model: 'Toyota Hiace', year: 2024, currentDriverId: qD.id } });
    const qT = await tok(qD);
    const qJoin = (route: string, gps: { lat: number; lng: number }, token = qT, vehicleId = qV.id) => call(token, 'POST', `/queues/${route}/join`, { vehicleId, deviceId: `q-${vehicleId.slice(-4)}`, ...gps });
    const qClean = (vehicleId = qV.id) => prisma.queueEntry.deleteMany({ where: { organizationId: orgA.id, vehicleId } });
    const notices = (personId: string, title: string) => prisma.notice.findMany({ where: { targetPersonId: personId, title } });
    const ownerAdmin = await prisma.person.findFirst({ where: { organizationId: orgA.id, role: 'ADMINISTRADOR' } });

    // 1. Sin historial: no entra solo
    r = await qJoin('PUNO_JULI', PUNO);
    check('sin historial, el conductor NO entra solo: el sistema pide autorización del administrador (403)', r.status === 403 && /autorizacion del administrador/.test(msg(r)), `HTTP ${r.status} ${msg(r)}`);
    const qReq1 = await prisma.enrollmentAuthRequest.findFirst({ where: { organizationId: orgA.id, vehicleId: qV.id, status: 'PENDIENTE' } });
    check('se creó sola una solicitud PENDIENTE de tipo SIN_HISTORIAL', qReq1?.type === 'SIN_HISTORIAL' && qReq1?.route === 'PUNO_JULI', JSON.stringify({ t: qReq1?.type, r: qReq1?.route }));
    await qJoin('PUNO_JULI', PUNO);
    check('intentar de nuevo no duplica la solicitud', (await prisma.enrollmentAuthRequest.count({ where: { vehicleId: qV.id, status: 'PENDIENTE' } })) === 1);
    check('el administrador recibe el aviso de la solicitud', (await notices(ownerAdmin!.id, 'Autorizacion de inscripcion pendiente')).length >= 1);
    r = await qJoin('PUNO_JULI', FAR);
    check('fuera del radio del terminal se rechaza por distancia y NO molesta al administrador (403 por radio, sin solicitud nueva)', r.status === 403 && /radio/.test(msg(r)) && (await prisma.enrollmentAuthRequest.count({ where: { vehicleId: qV.id } })) === 1, `HTTP ${r.status} ${msg(r)}`);
    r = await call(qT, 'GET', '/queues/enrollment-auth/mine');
    check('el conductor ve su solicitud pendiente en su Inicio', r.status === 200 && r.json.request?.status === 'PENDIENTE', JSON.stringify(r.json));

    // 2. Permisos
    r = await call(qT, 'GET', '/queues/enrollment-auth/list');
    check('el conductor NO puede ver la lista del administrador (403)', r.status === 403, `HTTP ${r.status}`);
    r = await call(T.admin, 'GET', '/queues/enrollment-auth/list');
    check('el administrador ve la solicitud en su lista', r.status === 200 && r.json.some((x: any) => x.id === qReq1!.id && x.vehicle.code === 'QA33'), `HTTP ${r.status}`);
    r = await call(TAO, 'POST', `/queues/enrollment-auth/${qReq1!.id}/resolve`, { approve: true, reason: 'Motivo de otra asociacion' });
    check('el administrador de OTRA asociación no puede resolverla (404)', r.status === 404, `HTTP ${r.status}`);
    r = await call(qT, 'POST', `/queues/enrollment-auth/${qReq1!.id}/resolve`, { approve: true, reason: 'Me autorizo yo mismo' });
    check('el conductor NO puede autorizarse a sí mismo (403)', r.status === 403, `HTTP ${r.status}`);

    // 3. El motivo es obligatorio al autorizar
    r = await call(T.admin, 'POST', `/queues/enrollment-auth/${qReq1!.id}/resolve`, { approve: true });
    check('autorizar SIN motivo se rechaza (400)', r.status === 400, `HTTP ${r.status} ${msg(r)}`);
    r = await call(T.admin, 'POST', `/queues/enrollment-auth/${qReq1!.id}/resolve`, { approve: true, reason: 'corto' });
    check('autorizar con un motivo demasiado corto se rechaza (400)', r.status === 400, `HTTP ${r.status}`);
    r = await call(T.admin, 'POST', `/queues/enrollment-auth/${qReq1!.id}/resolve`, { approve: true, reason: 'Unidad nueva de Rudy que llego de Lima el sabado y empieza en Puno' });
    check('con un motivo claro el administrador autoriza', r.status === 201 && r.json.status === 'AUTORIZADO', `HTTP ${r.status} ${msg(r)}`);
    check('el conductor recibe el aviso de que fue autorizado', (await notices(qD.id, 'Inscripcion autorizada')).length >= 1);

    // 4. Se inscribe con la autorizacion: al final de la cola y avisa a todos con el motivo
    r = await qJoin('PUNO_JULI', PUNO);
    check('autorizado, el conductor presiona Inscribirme otra vez y entra', r.status === 201, `HTTP ${r.status} ${msg(r)}`);
    const qEntry = await prisma.queueEntry.findFirst({ where: { organizationId: orgA.id, route: 'PUNO_JULI', vehicleId: qV.id } });
    const lastInQueue = await prisma.queueEntry.findMany({ where: { organizationId: orgA.id, route: 'PUNO_JULI', status: { notIn: ['AUSENTE', 'RETIRADO'] } }, orderBy: { position: 'desc' }, take: 1 });
    check('entra AL FINAL de la cola', !!qEntry && lastInQueue[0]?.id === qEntry.id, `pos ${qEntry?.position}`);
    check('la solicitud queda CONSUMIDA (no sirve una segunda vez)', (await prisma.enrollmentAuthRequest.findUnique({ where: { id: qReq1!.id } }))?.status === 'CONSUMIDO');
    const others = await notices(drivers[0].id, 'Unidad inscrita con autorizacion');
    check('otro conductor recibe el aviso con código de unidad, nombre del conductor y motivo', others.length >= 1 && /QA33 \(Rudy Prueba\)/.test(others[0].body) && /Lima el sabado/.test(others[0].body), others[0]?.body ?? 'sin aviso');
    check('el administrador recibe el mismo aviso', (await notices(ownerAdmin!.id, 'Unidad inscrita con autorizacion')).length >= 1);
    check('quien se inscribió no recibe su propio aviso especial', (await notices(qD.id, 'Unidad inscrita con autorizacion')).length === 0);
    await qClean();

    // 5. Rechazo
    r = await qJoin('PUNO_JULI', PUNO);
    check('sin historial vuelve a pedir autorización (nueva solicitud)', r.status === 403 && /autorizacion/.test(msg(r)), `HTTP ${r.status}`);
    const qReq2 = await prisma.enrollmentAuthRequest.findFirst({ where: { vehicleId: qV.id, status: 'PENDIENTE' } });
    r = await call(T.admin, 'POST', `/queues/enrollment-auth/${qReq2!.id}/resolve`, { approve: false, reason: 'No te conozco en esta terminal' });
    check('el administrador puede rechazar', r.status === 201 && r.json.status === 'RECHAZADO', `HTTP ${r.status} ${msg(r)}`);
    r = await qJoin('PUNO_JULI', PUNO);
    check('rechazada, el conductor no entra (403)', r.status === 403, `HTTP ${r.status}`);
    r = await call(qT, 'GET', '/queues/enrollment-auth/mine');
    check('el conductor ve el rechazo con el motivo', r.status === 200 && (r.json.request?.status === 'RECHAZADO' || r.json.request?.status === 'PENDIENTE'), JSON.stringify(r.json));
    check('el conductor recibe el aviso del rechazo con el motivo', (await notices(qD.id, 'Inscripcion rechazada')).some((n) => /No te conozco/.test(n.body)));
    r = await call(T.admin, 'POST', `/queues/enrollment-auth/${qReq2!.id}/resolve`, { approve: true, reason: 'Ya estaba resuelta' });
    check('una solicitud ya resuelta no se puede volver a resolver (400)', r.status === 400, `HTTP ${r.status}`);
    await prisma.enrollmentAuthRequest.updateMany({ where: { vehicleId: qV.id, status: 'PENDIENTE' }, data: { status: 'EXPIRADO' } });

    // 6. Administrador inscribe directo
    r = await call(T.admin, 'POST', '/queues/PUNO_JULI/join', { vehicleId: qV.id, ...PUNO });
    check('el administrador inscribe la unidad sin pedir autorización (carga manual del primer día)', r.status === 201, `HTTP ${r.status} ${msg(r)}`);
    await qClean();

    // 7. Historial que no calza: su ultimo viaje termino en Puno pero dice salir de Juli
    const mD = await mk(orgA.id, 'CONDUCTOR', 'Marco Historial', 34);
    const mV = await prisma.vehicle.create({ data: { organizationId: orgA.id, code: 'QB34', companyId: coA.id, vehicleType: 'HIACE', plate: `QB${stamp.slice(-1)}-334`, model: 'Toyota Hiace', year: 2024, currentDriverId: mD.id } });
    const mT = await tok(mD);
    await prisma.trip.create({ data: { organizationId: orgA.id, vehicleId: mV.id, driverId: mD.id, route: 'JULI_PUNO', status: 'COMPLETADO', scheduledDeparture: new Date(Date.now() - 6 * 3600e3), actualDeparture: new Date(Date.now() - 6 * 3600e3), actualArrival: new Date(Date.now() - 3 * 3600e3), scheduledArrival: new Date(Date.now() - 3 * 3600e3) } as any });
    r = await qJoin('JULI_PUNO', JULI, mT, mV.id);
    check('llegó a Puno y ahora dice salir de Juli sin viaje de por medio: necesita autorización (403)', r.status === 403 && /autorizacion del administrador/.test(msg(r)), `HTTP ${r.status} ${msg(r)}`);
    check('la solicitud es de tipo NO_COINCIDE', (await prisma.enrollmentAuthRequest.findFirst({ where: { vehicleId: mV.id, status: 'PENDIENTE' } }))?.type === 'NO_COINCIDE');
    await prisma.enrollmentAuthRequest.updateMany({ where: { vehicleId: mV.id }, data: { status: 'EXPIRADO' } });
    r = await qJoin('PUNO_JULI', PUNO, mT, mV.id);
    check('en cambio, inscribirse en Puno → Juli (donde terminó su viaje) entra normal, sin autorización', r.status === 201, `HTTP ${r.status} ${msg(r)}`);

    // 8. "No saldre ahora": al volver a inscribirse se avisa a todos
    const mEntry = await prisma.queueEntry.findFirst({ where: { organizationId: orgA.id, route: 'PUNO_JULI', vehicleId: mV.id } });
    r = await call(mT, 'POST', `/queues/entries/${mEntry!.id}/declare-later`);
    check('el conductor declara "No saldré ahora"', r.status === 201, `HTTP ${r.status} ${msg(r)}`);
    r = await qJoin('PUNO_JULI', PUNO, mT, mV.id);
    check('más tarde vuelve a inscribirse y entra (sin pedir autorización)', r.status === 201, `HTTP ${r.status} ${msg(r)}`);
    const qLater = await notices(drivers[0].id, 'Unidad inscrita mas tarde');
    check('los demás conductores reciben el aviso "había dicho que saldría más tarde" con código y nombre', qLater.length >= 1 && /QB34 \(Marco Historial\)/.test(qLater[0].body) && /posicion/.test(qLater[0].body), qLater[0]?.body ?? 'sin aviso');
    check('el administrador también recibe ese aviso', (await notices(ownerAdmin!.id, 'Unidad inscrita mas tarde')).length >= 1);
    await qClean(mV.id);

    // 8b. Una inscripcion NORMAL no genera avisos especiales
    const before = await prisma.notice.count({ where: { organizationId: orgA.id, title: { in: ['Unidad inscrita con autorizacion', 'Unidad inscrita mas tarde'] } } });
    r = await qJoin('PUNO_JULI', PUNO, mT, mV.id);
    // (la unidad ya tiene entrada reciente y viaje coherente: inscripcion normal)
    const after = await prisma.notice.count({ where: { organizationId: orgA.id, title: { in: ['Unidad inscrita con autorizacion', 'Unidad inscrita mas tarde'] } } });
    check('una inscripción normal no genera avisos en la campanita', r.status === 201 && after === before, `HTTP ${r.status} avisos ${before}→${after}`);
    await qClean(mV.id);

    // 9. Interruptor por asociacion (solo Super Admin)
    const superQ = await prisma.person.create({ data: { organizationId: null, name: 'Super E2E Q', email: `e2e.${stamp}.superq@example.test`, role: 'SUPERADMIN', status: 'ACTIVO' } });
    const TSQ = await tok(superQ);
    r = await call(T.admin, 'POST', '/operational-config', { enrollmentAuthRequired: false });
    check('el administrador NO puede apagar la exigencia (solo Super Admin, 403)', r.status === 403, `HTTP ${r.status}`);
    r = await call(TSQ, 'POST', `/operational-config?organizationId=${orgA.id}`, { enrollmentAuthRequired: false });
    check('el Super Admin puede apagarla para una asociación', r.status === 201 && r.json.enrollmentAuthRequired === false, `HTTP ${r.status} ${msg(r)}`);
    r = await qJoin('PUNO_JULI', PUNO);
    check('con la exigencia apagada, una unidad sin historial entra directo', r.status === 201, `HTTP ${r.status} ${msg(r)}`);
    await qClean();
    await prisma.person.delete({ where: { id: superQ.id } }).catch(() => null);
    await prisma.operationalConfig.update({ where: { organizationId: orgA.id }, data: { enrollmentAuthRequired: false } });

    // ═════════ J. CONSISTENCIA FINAL ═════════
    head('J. Consistencia de datos');
    await prisma.queueEntry.deleteMany({ where: { organizationId: orgA.id } });
    const orphanPos = await prisma.queueEntry.count({ where: { organizationId: orgA.id } });
    check('no quedan inscripciones sueltas al limpiar', orphanPos === 0);
    const dupLlamado = await Promise.all(['JULI_PUNO', 'PUNO_JULI'].map((rt) => prisma.queueEntry.count({ where: { organizationId: orgA.id, route: rt as any, status: 'LLAMADO' } })));
    check('nunca hay dos unidades LLAMADO en la misma cola', dupLlamado.every((n) => n <= 1));
    const audits = await prisma.auditEntry.count({ where: { organizationId: orgA.id, action: { in: ['INSCRIPCION_COLA', 'DESPACHAR_VIAJE', 'ABRIR_MANIFIESTO', 'COMPLETAR_VIAJE'] } } });
    check('las acciones importantes quedaron en Auditoría', audits >= 8, `${audits} registros`);
  } catch (e: any) {
    console.error('\nERROR DEL SCRIPT:', e.message);
    check('el script terminó sin excepciones', false, e.message);
  } finally {
    for (const id of orgIds) {
      try {
        const manIds = (await prisma.manifest.findMany({ where: { organizationId: id }, select: { id: true } })).map((m) => m.id);
        await prisma.passenger.deleteMany({ where: { manifestId: { in: manIds } } });
        await prisma.auditEntry.deleteMany({ where: { organizationId: id } });
        await prisma.manifest.deleteMany({ where: { organizationId: id } });
        await prisma.trip.updateMany({ where: { organizationId: id }, data: { predecessorTripId: null } });
        await prisma.trip.deleteMany({ where: { organizationId: id } });
        await prisma.delayedRegistrationRequest.deleteMany({ where: { organizationId: id } });
        await prisma.gpsFallbackRequest.deleteMany({ where: { organizationId: id } });
        await prisma.enrollmentAuthRequest.deleteMany({ where: { organizationId: id } });
        const ordIds = (await prisma.relocationOrder.findMany({ where: { organizationId: id }, select: { id: true } })).map((o) => o.id);
        await prisma.relocationUnit.deleteMany({ where: { relocationOrderId: { in: ordIds } } });
        await prisma.relocationOrder.deleteMany({ where: { organizationId: id } });
        await prisma.queueEntry.deleteMany({ where: { organizationId: id } });
        await prisma.passengerProfile.deleteMany({ where: { organizationId: id } });
        const vIds = (await prisma.vehicle.findMany({ where: { organizationId: id }, select: { id: true } })).map((v) => v.id);
        await prisma.vehiclePlateHistory.deleteMany({ where: { vehicleId: { in: vIds } } });
        await prisma.notice.deleteMany({ where: { organizationId: id } }).catch(() => null);
        await prisma.vehicle.deleteMany({ where: { organizationId: id } });
        await prisma.person.deleteMany({ where: { organizationId: id } });
        await prisma.operationalConfig.deleteMany({ where: { organizationId: id } });
        await prisma.company.deleteMany({ where: { organizationId: id } });
        await prisma.organization.delete({ where: { id } });
      } catch (err: any) { console.log('LIMPIEZA con aviso:', String(err.message).split('\n').slice(-2).join(' ').slice(0, 160)); }
    }
    console.log('LIMPIEZA; asociaciones ZZ E2E restantes:', await prisma.organization.count({ where: { name: { startsWith: 'ZZ E2E' } } }), '| personas @example.test:', await prisma.person.count({ where: { email: { endsWith: '@example.test' } } }));
    await app.close();
  }
  const bad = results.filter((x) => !x.ok);
  console.log(`\n══════ RESUMEN: ${results.length - bad.length} bien, ${bad.length} con falla ══════`);
  for (const b of bad) console.log(`  ✗ [${b.section}] ${b.label}${b.detail ? ` → ${b.detail}` : ''}`);
  process.exit(bad.length > 0 ? 1 : 0); // codigo de salida distinto de 0 si algo fallo (lo usa el CI)
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
