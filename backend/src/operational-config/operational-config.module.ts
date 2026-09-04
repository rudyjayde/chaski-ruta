import { Module } from '@nestjs/common';
import { OperationalConfigController } from './operational-config.controller';
import { OperationalConfigService } from './operational-config.service';

@Module({
  controllers: [OperationalConfigController],
  providers: [OperationalConfigService],
})
export class OperationalConfigModule {}
