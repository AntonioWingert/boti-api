import { Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappSessionService } from './whatsapp-session.service';
import { WhatsappSessionController } from './whatsapp-session.controller';
import { WhatsappSyncService } from './whatsapp-sync.service';
import { MessagesModule } from '../messages/messages.module';
import { ClientsModule } from '../clients/clients.module';
import { ChatbotsModule } from '../chatbots/chatbots.module';
import { ChatbotModule } from '../chatbot/chatbot.module';
import { WhatsappResponseService } from '../chatbot/whatsapp-response.service';
import { EventsModule } from '../events/events.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, MessagesModule, ClientsModule, ChatbotsModule, ChatbotModule, EventsModule, NotificationsModule],
  controllers: [WhatsappController, WhatsappSessionController],
  providers: [WhatsappService, WhatsappResponseService, WhatsappSessionService, WhatsappSyncService],
  exports: [WhatsappService, WhatsappResponseService, WhatsappSessionService, WhatsappSyncService],
})
export class WhatsappModule {}
