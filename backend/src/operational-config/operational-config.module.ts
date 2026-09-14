import { Module } from '@nestjs/common';
import { OperationalConfigController } from './operational-config.controller';
import { OperationalConfigService } from './operational-config.service';

@Module({
  controllers: [OperationalConfigController],
  providers: [OperationalConfigService],
  // Exportado para que route-risk.module.ts pueda leer el corredor real
  // (terminales) de la asociacion sin duplicar el patron get-or-create.
  exports: [OperationalConfigService],
})
export class OperationalConfigModule {}
