import { Global, Module } from '@nestjs/common';
import { PushService } from './push.service';

// Global: avisos, colas y cualquier modulo futuro avisan al celular sin importarlo uno por uno.
@Global()
@Module({
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
