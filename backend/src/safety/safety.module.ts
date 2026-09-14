import { Module } from '@nestjs/common';
import { GpsModule } from '../gps/gps.module';
import { MailModule } from '../mail/mail.module';
import { AccidentDetectionService } from './accident-detection.service';

// Modulo de seguridad automatizada (docs/planes/ia-aplicada.md §3): agrupa
// las funciones que corren solas por cron, sin que nadie tenga que abrir el
// panel -- empieza con deteccion de posibles accidentes (§3.1, prioridad 1).
// PrismaModule es @Global() (ver prisma.module.ts), no hace falta importarlo.
@Module({
  imports: [GpsModule, MailModule],
  providers: [AccidentDetectionService],
})
export class SafetyModule {}
