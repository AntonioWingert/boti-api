import { Module } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';
import { ScalableMessageService } from './scalable-message.service';
import { MessageCacheService } from './message-cache.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MessagesController],
  providers: [MessagesService, ScalableMessageService, MessageCacheService],
  exports: [MessagesService, ScalableMessageService, MessageCacheService],
})
export class MessagesModule {}
