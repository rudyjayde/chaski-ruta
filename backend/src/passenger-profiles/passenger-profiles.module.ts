import { Module } from '@nestjs/common';
import { PassengerProfilesController } from './passenger-profiles.controller';
import { PassengerProfilesService } from './passenger-profiles.service';

@Module({
  controllers: [PassengerProfilesController],
  providers: [PassengerProfilesService],
})
export class PassengerProfilesModule {}
