import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConversationController } from './conversation.controller';
import { ConversationMonitorService } from './conversation-monitor.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [
    WhatsappModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-here',
      signOptions: { expiresIn: '24h' },
    })
  ],
  controllers: [ConversationController],
  providers: [ConversationMonitorService, PrismaService],
  exports: [ConversationMonitorService],
})
export class ConversationModule {}

