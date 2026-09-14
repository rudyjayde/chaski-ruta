import { Module } from '@nestjs/common';
import { ComplaintBookController } from './complaint-book.controller';
import { ComplaintBookService } from './complaint-book.service';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [MailModule],
  controllers: [ComplaintBookController],
  providers: [ComplaintBookService],
})
export class ComplaintBookModule {}
