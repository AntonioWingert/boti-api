import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { resolve } from 'path';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { CompaniesModule } from './companies/companies.module';
import { ClientsModule } from './clients/clients.module';
import { ChatbotsModule } from './chatbots/chatbots.module';
import { MessagesModule } from './messages/messages.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { FlowModule } from './flow/flow.module';
import { ConversationModule } from './conversation/conversation.module';
import { EventsModule } from './events/events.module';
import { DisparosModule } from './disparos/disparos.module';
import { PendingUsersModule } from './admin/pending-users.module';
import { StorageModule } from './storage/storage.module';
import { AuthModule } from './auth/auth.module';
import { NotificationsModule } from './notifications/notifications.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { SearchModule } from './search/search.module';

@Module({
  imports: [
    // Servir arquivos estáticos de upload em /uploads
    ServeStaticModule.forRoot({
      rootPath: resolve(process.env.UPLOAD_DIR || './uploads'),
      serveRoot: '/uploads',
    }),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    UsersModule,
    CompaniesModule,
    ClientsModule,
    ChatbotsModule,
    MessagesModule,
    WhatsappModule,
    FlowModule,
    ConversationModule,
    EventsModule,
    DisparosModule,
    PendingUsersModule,
    StorageModule,
    AuthModule,
    NotificationsModule,
    DashboardModule,
    SearchModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
