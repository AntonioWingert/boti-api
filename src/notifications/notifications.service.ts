import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';

export interface CreateNotificationDto {
  userId?: string;
  companyId?: string;
  type: 'CONNECTION_LOST' | 'NEW_REGISTRATION_REQUEST' | 'BOT_UPDATED' | 'SUGGESTION_ACCEPTED' | 'CONNECTION_RESTORED' | 'SYSTEM_ALERT';
  title: string;
  message: string;
  data?: any;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  targetRole?: 'ADMIN' | 'USER' | 'ALL';
}

export interface NotificationFilters {
  userId?: string;
  companyId?: string;
  type?: string;
  read?: boolean;
  priority?: string;
  targetRole?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
  ) {}

  async createNotification(notificationData: CreateNotificationDto) {
    try {
      const notification = await this.prisma.notification.create({
        data: {
          userId: notificationData.userId,
          companyId: notificationData.companyId,
          type: notificationData.type,
          title: notificationData.title,
          message: notificationData.message,
          data: notificationData.data,
          priority: notificationData.priority,
          targetRole: notificationData.targetRole,
        },
      });

      // Enviar notificação em tempo real via WebSocket
      await this.sendRealtimeNotification(notification);

      this.logger.log(`Notification created: ${notification.id} - ${notification.title}`);
      return notification;
    } catch (error) {
      this.logger.error('Error creating notification:', error);
      throw error;
    }
  }

  async getNotifications(filters: NotificationFilters = {}) {
    const where: any = {};

    if (filters.userId) where.userId = filters.userId;
    if (filters.companyId) where.companyId = filters.companyId;
    if (filters.type) where.type = filters.type;
    if (filters.read !== undefined) where.read = filters.read;
    if (filters.priority) where.priority = filters.priority;
    if (filters.targetRole) where.targetRole = filters.targetRole;

    return this.prisma.notification.findMany({
      where,
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' }
      ],
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          }
        },
        company: {
          select: {
            id: true,
            name: true,
          }
        }
      }
    });
  }

  async markAsRead(notificationId: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: {
        id: notificationId,
        userId: userId,
      },
      data: {
        read: true,
        readAt: new Date(),
      },
    });
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: {
        userId: userId,
        read: false,
      },
      data: {
        read: true,
        readAt: new Date(),
      },
    });
  }

  async deleteNotification(notificationId: string, userId: string) {
    return this.prisma.notification.deleteMany({
      where: {
        id: notificationId,
        userId: userId,
      },
    });
  }

  async getUnreadCount(userId: string) {
    return this.prisma.notification.count({
      where: {
        userId: userId,
        read: false,
      },
    });
  }

  // Métodos específicos para diferentes tipos de notificações
  async notifyConnectionLost(sessionId: string, sessionName: string, companyId: string) {
    const users = await this.prisma.user.findMany({
      where: { companyId },
      select: { id: true, name: true }
    });

    for (const user of users) {
      await this.createNotification({
        userId: user.id,
        companyId,
        type: 'CONNECTION_LOST',
        title: 'Conexão WhatsApp Perdida',
        message: `A conexão "${sessionName}" foi perdida. Verifique sua conexão de internet.`,
        data: { sessionId, sessionName },
        priority: 'HIGH',
        targetRole: 'USER',
      });
    }
  }

  async notifyConnectionRestored(sessionId: string, sessionName: string, companyId: string) {
    const users = await this.prisma.user.findMany({
      where: { companyId },
      select: { id: true, name: true }
    });

    for (const user of users) {
      await this.createNotification({
        userId: user.id,
        companyId,
        type: 'CONNECTION_RESTORED',
        title: 'Conexão WhatsApp Restaurada',
        message: `A conexão "${sessionName}" foi restaurada com sucesso.`,
        data: { sessionId, sessionName },
        priority: 'MEDIUM',
        targetRole: 'USER',
      });
    }
  }

  async notifyNewRegistrationRequest(pendingUserId: string, companyName: string, userName: string) {
    // Notificar todos os admins
    const admins = await this.prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { id: true, name: true }
    });

    for (const admin of admins) {
      await this.createNotification({
        userId: admin.id,
        type: 'NEW_REGISTRATION_REQUEST',
        title: 'Nova Solicitação de Registro',
        message: `${userName} da empresa "${companyName}" solicitou acesso à plataforma.`,
        data: { pendingUserId, companyName, userName },
        priority: 'HIGH',
        targetRole: 'ADMIN',
      });
    }
  }

  async notifyBotUpdated(botId: string, botName: string, companyId: string, changes: string[]) {
    const users = await this.prisma.user.findMany({
      where: { companyId },
      select: { id: true, name: true }
    });

    for (const user of users) {
      await this.createNotification({
        userId: user.id,
        companyId,
        type: 'BOT_UPDATED',
        title: 'Chatbot Atualizado',
        message: `O chatbot "${botName}" foi atualizado. Alterações: ${changes.join(', ')}`,
        data: { botId, botName, changes },
        priority: 'MEDIUM',
        targetRole: 'USER',
      });
    }
  }

  async notifySuggestionAccepted(suggestionId: string, suggestionTitle: string, companyId: string) {
    const users = await this.prisma.user.findMany({
      where: { companyId },
      select: { id: true, name: true }
    });

    for (const user of users) {
      await this.createNotification({
        userId: user.id,
        companyId,
        type: 'SUGGESTION_ACCEPTED',
        title: 'Sugestão Aceita',
        message: `Sua sugestão "${suggestionTitle}" foi aceita e implementada.`,
        data: { suggestionId, suggestionTitle },
        priority: 'MEDIUM',
        targetRole: 'USER',
      });
    }
  }

  private async sendRealtimeNotification(notification: any) {
    try {
      // Por enquanto, vamos usar um método simples
      // Em uma implementação completa, você usaria o EventsService
      // para enviar notificações em tempo real via WebSocket
      this.logger.log(`Notification created: ${notification.id} - ${notification.title}`);
    } catch (error) {
      this.logger.error('Error sending realtime notification:', error);
    }
  }
}
