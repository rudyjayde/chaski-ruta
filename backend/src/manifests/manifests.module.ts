import { Module } from '@nestjs/common';
import { ManifestsController } from './manifests.controller';
import { ManifestVerificationController } from './manifest-verification.controller';
import { ManifestsService } from './manifests.service';
import { AiModule } from '../ai/ai.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [AiModule, MailModule],
  controllers: [ManifestsController, ManifestVerificationController],
  providers: [ManifestsService],
  exports: [ManifestsService],
})
export class ManifestsModule {}
