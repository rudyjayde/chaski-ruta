import { Module } from '@nestjs/common';
import { CommercialRequestsController } from './commercial-requests.controller';
import { CommercialRequestsService } from './commercial-requests.service';
import { MailModule } from '../mail/mail.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [MailModule, AiModule],
  controllers: [CommercialRequestsController],
  providers: [CommercialRequestsService],
})
export class CommercialRequestsModule {}
