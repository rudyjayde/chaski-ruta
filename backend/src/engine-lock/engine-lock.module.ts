import { Module } from '@nestjs/common';
import { GpsModule } from '../gps/gps.module';
import { NoticesModule } from '../notices/notices.module';
import { EngineLockService } from './engine-lock.service';
import { EngineLockController } from './engine-lock.controller';

@Module({
  imports: [GpsModule, NoticesModule],
  controllers: [EngineLockController],
  providers: [EngineLockService],
})
export class EngineLockModule {}
