import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { ConversationStatus, Priority, MessageSender, MessageType, StorageTier } from '@prisma/client';
import { ScalableMessageService } from './scalable-message.service';
import { MessageCacheService } from './message-cache.service';

@Injectable()
export class MessagesService {
  constructor(
    private prisma: PrismaService,
    private scalableMessageService: ScalableMessageService,
    private messageCacheService: MessageCacheService
  ) {}

  async createConversation(createConversationDto: CreateConversationDto) {
    // Verify if company and client exist
    const company = await this.prisma.company.findUnique({
      where: { id: createConversationDto.companyId },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    const client = await this.prisma.client.findUnique({
      where: { id: createConversationDto.clientId },
    });

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    // If chatbotId is provided, verify it exists
    if (createConversationDto.chatbotId) {
      const chatbot = await this.prisma.chatbot.findUnique({
        where: { id: createConversationDto.chatbotId },
      });

      if (!chatbot) {
        throw new NotFoundException('Chatbot not found');
      }
    }

    // If userId is provided, verify it exists
    if (createConversationDto.userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: createConversationDto.userId },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }
    }

    return this.prisma.conversation.create({
      data: {
        ...createConversationDto,
        status: createConversationDto.status || ConversationStatus.ACTIVE,
        priority: createConversationDto.priority || Priority.NORMAL,
        escalated: createConversationDto.escalated || false,
      },
      include: {
        company: true,
        client: true,
        chatbot: true,
        user: true,
      },
    });
  }

  async findAllConversations(companyId?: string, status?: ConversationStatus) {
    const where: any = {};
    
    if (companyId) {
      where.companyId = companyId;
    }
    
    if (status) {
      where.status = status;
    }

    return this.prisma.conversation.findMany({
      where,
      include: {
        company: true,
        client: true,
        chatbot: true,
        user: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });
  }

  async findConversationById(id: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: {
        company: true,
        client: true,
        chatbot: true,
        user: true,
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    return conversation;
  }

  async createMessage(createMessageDto: CreateMessageDto) {
    try {
      // Usar o serviço escalável para criar mensagem
      const message = await this.scalableMessageService.createMessage({
        conversationId: createMessageDto.conversationId,
        content: createMessageDto.content,
        sender: createMessageDto.sender as MessageSender || MessageSender.CLIENT,
        messageType: createMessageDto.messageType as MessageType || MessageType.TEXT,
        metadata: createMessageDto.metadata
      });

      // Invalidar cache da conversa
      this.messageCacheService.invalidateConversationCache(createMessageDto.conversationId);

      return message;
    } catch (error) {
      throw new NotFoundException('Error creating message: ' + error.message);
    }
  }

  async findMessagesByConversation(conversationId: string, limit: number = 50, offset: number = 0) {
    try {
      // Usar cache para mensagens recentes
      const recentMessages = await this.messageCacheService.getRecentMessages(conversationId, limit);
      
      if (recentMessages.length > 0) {
        return recentMessages;
      }

      // Se não encontrou no cache, buscar do banco
      return await this.scalableMessageService.findConversationMessages(conversationId, limit, offset);
    } catch (error) {
      throw new NotFoundException('Error finding messages: ' + error.message);
    }
  }

  async updateConversationStatus(id: string, status: ConversationStatus) {
    const conversation = await this.findConversationById(id);

    return this.prisma.conversation.update({
      where: { id },
      data: { 
        status,
        finishedAt: status === ConversationStatus.FINISHED ? new Date() : null,
      },
    });
  }

  async escalateConversation(id: string, userId: string) {
    const conversation = await this.findConversationById(id);

    return this.prisma.conversation.update({
      where: { id },
      data: {
        escalated: true,
        status: ConversationStatus.ESCALATED,
        userId,
        priority: Priority.HIGH,
      },
    });
  }

  async assignConversationToUser(id: string, userId: string) {
    const conversation = await this.findConversationById(id);

    // Verify if user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.prisma.conversation.update({
      where: { id },
      data: {
        userId,
        status: ConversationStatus.ACTIVE,
      },
    });
  }

  async markMessageAsRead(id: string) {
    // Mensagens não são mais salvas - método desabilitado
    return { message: 'Message read status not tracked' };
  }

  async markMessageAsSent(id: string) {
    // Mensagens não são mais salvas - método desabilitado
    return { message: 'Message sent status not tracked' };
  }

  /**
   * Busca mensagens recentes de um cliente
   */
  async findRecentClientMessages(clientId: string, limit: number = 20) {
    return await this.scalableMessageService.findRecentClientMessages(clientId, limit);
  }

  /**
   * Busca conversas ativas com cache
   */
  async findActiveConversations(companyId: string) {
    return await this.messageCacheService.getActiveConversations(companyId);
  }

  /**
   * Cria resumo de uma conversa
   */
  async createConversationSummary(conversationId: string) {
    return await this.scalableMessageService.createConversationSummary(conversationId);
  }

  /**
   * Busca estatísticas de mensagens
   */
  async getMessageStats(companyId: string, days: number = 7) {
    return await this.messageCacheService.getMessageStats(companyId, days);
  }

  /**
   * Arquivar mensagens antigas
   */
  async archiveOldMessages() {
    return await this.scalableMessageService.archiveOldMessages();
  }

  /**
   * Busca mensagens com filtros avançados
   */
  async findMessagesWithFilters(options: {
    conversationId?: string;
    clientId?: string;
    companyId?: string;
    storageTier?: StorageTier;
    limit?: number;
    offset?: number;
    startDate?: Date;
    endDate?: Date;
  }) {
    return await this.scalableMessageService.findMessages(options);
  }

  async getStats(companyId?: string) {
    try {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

      const where = companyId ? { 
        conversation: { companyId }
      } : {};

      const [total, today, thisMonth, lastMonth] = await Promise.all([
        this.prisma.message.count({ where }),
        this.prisma.message.count({
          where: { 
            ...where,
            createdAt: { gte: startOfDay }
          }
        }),
        this.prisma.message.count({
          where: { 
            ...where,
            createdAt: { gte: startOfMonth }
          }
        }),
        this.prisma.message.count({
          where: { 
            ...where,
            createdAt: { 
              gte: startOfLastMonth,
              lte: endOfLastMonth
            }
          }
        })
      ]);

      const change = lastMonth > 0 ? 
        Math.round(((thisMonth / lastMonth) * 100) - 100) : 0;

      return {
        total,
        today,
        change
      };
    } catch (error) {
      // Retornar dados padrão em caso de erro
      return {
        total: 0,
        today: 0,
        change: 0
      };
    }
  }

  async getRecent(companyId?: string, limit: number = 5) {
    try {
      const where = companyId ? { 
        conversation: { companyId }
      } : {};

      return this.prisma.message.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          conversation: {
            include: {
              client: {
                select: { name: true }
              }
            }
          }
        }
      });
    } catch (error) {
      // Retornar array vazio em caso de erro
      return [];
    }
  }
}
