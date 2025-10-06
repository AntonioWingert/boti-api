import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ChatbotFlowService } from './chatbot-flow.service';
import { ConversationManagerService } from './conversation-manager.service';

@Module({
  imports: [PrismaModule],
  providers: [
    ChatbotFlowService,
    ConversationManagerService,
  ],
  exports: [
    ChatbotFlowService,
    ConversationManagerService,
  ],
})
export class ChatbotModule {}
