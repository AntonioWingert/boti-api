import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MessageSender, MessageType, StorageTier } from '@prisma/client';

export interface CreateMessageDto {
  conversationId: string;
  content: string;
  sender: MessageSender;
  messageType?: MessageType;
  metadata?: any;
}

export interface MessageQueryOptions {
  conversationId?: string;
  clientId?: string;
  companyId?: string;
  storageTier?: StorageTier;
  limit?: number;
  offset?: number;
  startDate?: Date;
  endDate?: Date;
}

@Injectable()
export class ScalableMessageService {
  private readonly logger = new Logger(ScalableMessageService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Cria uma nova mensagem com estratégia de armazenamento inteligente
   */
  async createMessage(createMessageDto: CreateMessageDto) {
    try {
      // 1. Verificar se a conversa existe
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: createMessageDto.conversationId },
        include: { client: true }
      });

      if (!conversation) {
        throw new Error('Conversation not found');
      }

      // 2. Determinar camada de armazenamento baseada na idade da conversa
      const storageTier = this.determineStorageTier(conversation.createdAt);

      // 3. Criar mensagem
      const message = await this.prisma.message.create({
        data: {
          ...createMessageDto,
          clientId: conversation.clientId,
          companyId: conversation.companyId,
          storageTier,
          messageType: createMessageDto.messageType || MessageType.TEXT,
        }
      });

      // 4. Atualizar cache da conversa
      await this.updateConversationCache(conversation.id, createMessageDto.content);

      // 5. Verificar se precisa arquivar mensagens antigas
      await this.checkAndArchiveOldMessages(conversation.id);

      this.logger.log(`Message created: ${message.id} in ${storageTier} storage`);
      return message;

    } catch (error) {
      this.logger.error('Error creating message:', error);
      throw error;
    }
  }

  /**
   * Busca mensagens com estratégia de cache inteligente
   */
  async findMessages(options: MessageQueryOptions) {
    try {
      const where: any = {};

      if (options.conversationId) where.conversationId = options.conversationId;
      if (options.clientId) where.clientId = options.clientId;
      if (options.companyId) where.companyId = options.companyId;
      if (options.storageTier) where.storageTier = options.storageTier;
      if (options.startDate || options.endDate) {
        where.createdAt = {};
        if (options.startDate) where.createdAt.gte = options.startDate;
        if (options.endDate) where.createdAt.lte = options.endDate;
      }

      // 1. Tentar buscar primeiro da camada HOT (cache)
      let messages = await this.prisma.message.findMany({
        where: { ...where, storageTier: StorageTier.HOT },
        orderBy: { createdAt: 'desc' },
        take: options.limit || 50,
        skip: options.offset || 0,
      });

      // 2. Se não encontrou o suficiente, buscar da camada WARM
      if (messages.length < (options.limit || 50)) {
        const warmMessages = await this.prisma.message.findMany({
          where: { ...where, storageTier: StorageTier.WARM },
          orderBy: { createdAt: 'desc' },
          take: (options.limit || 50) - messages.length,
          skip: Math.max(0, (options.offset || 0) - messages.length),
        });
        messages = [...messages, ...warmMessages];
      }

      // 3. Se ainda não encontrou o suficiente, buscar do arquivo frio
      if (messages.length < (options.limit || 50)) {
        const coldMessages = await this.getColdStorageMessages(where, options);
        messages = [...messages, ...coldMessages];
      }

      return messages;

    } catch (error) {
      this.logger.error('Error finding messages:', error);
      throw error;
    }
  }

  /**
   * Busca mensagens recentes de um cliente (últimas 24h)
   */
  async findRecentClientMessages(clientId: string, limit: number = 20) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    return this.findMessages({
      clientId,
      startDate: yesterday,
      limit,
      storageTier: StorageTier.HOT
    });
  }

  /**
   * Busca mensagens de uma conversa específica
   */
  async findConversationMessages(conversationId: string, limit: number = 50, offset: number = 0) {
    return this.findMessages({
      conversationId,
      limit,
      offset
    });
  }

  /**
   * Cria resumo de uma conversa
   */
  async createConversationSummary(conversationId: string) {
    try {
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { messages: { orderBy: { createdAt: 'asc' } } }
      });

      if (!conversation) {
        throw new Error('Conversation not found');
      }

      // Gerar resumo usando IA (implementar com OpenAI ou similar)
      const summary = await this.generateSummary(conversation.messages);
      
      // Calcular métricas
      const messageCount = conversation.messages.length;
      const duration = conversation.finishedAt 
        ? Math.floor((conversation.finishedAt.getTime() - conversation.createdAt.getTime()) / 60000)
        : null;

      // Salvar resumo
      const conversationSummary = await this.prisma.conversationSummary.upsert({
        where: { conversationId },
        update: {
          summary: summary.text,
          keyPoints: summary.keyPoints,
          sentiment: summary.sentiment,
          tags: JSON.stringify(summary.tags),
          messageCount,
          duration,
        },
        create: {
          conversationId,
          summary: summary.text,
          keyPoints: summary.keyPoints,
          sentiment: summary.sentiment,
          tags: JSON.stringify(summary.tags),
          messageCount,
          duration,
        }
      });

      this.logger.log(`Conversation summary created: ${conversationId}`);
      return conversationSummary;

    } catch (error) {
      this.logger.error('Error creating conversation summary:', error);
      throw error;
    }
  }

  /**
   * Arquivar mensagens antigas para camada fria
   */
  async archiveOldMessages() {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Buscar mensagens antigas da camada WARM
      const oldMessages = await this.prisma.message.findMany({
        where: {
          storageTier: StorageTier.WARM,
          createdAt: { lt: thirtyDaysAgo }
        },
        take: 1000 // Processar em lotes
      });

      if (oldMessages.length === 0) {
        return { archived: 0 };
      }

      // Simular arquivamento para S3/FileSystem
      const archivePath = `archive/${new Date().getFullYear()}/${new Date().getMonth() + 1}/messages.json`;
      
      // Atualizar mensagens para camada fria
      await this.prisma.message.updateMany({
        where: {
          id: { in: oldMessages.map(m => m.id) }
        },
        data: {
          storageTier: StorageTier.COLD,
          archivedAt: new Date(),
          archivedPath: archivePath
        }
      });

      this.logger.log(`Archived ${oldMessages.length} messages to cold storage`);
      return { archived: oldMessages.length };

    } catch (error) {
      this.logger.error('Error archiving messages:', error);
      throw error;
    }
  }

  /**
   * Determina a camada de armazenamento baseada na idade da conversa
   */
  private determineStorageTier(conversationCreatedAt: Date): StorageTier {
    const now = new Date();
    const hoursSinceCreation = (now.getTime() - conversationCreatedAt.getTime()) / (1000 * 60 * 60);

    if (hoursSinceCreation < 24) {
      return StorageTier.HOT;
    } else if (hoursSinceCreation < 24 * 30) {
      return StorageTier.WARM;
    } else {
      return StorageTier.COLD;
    }
  }

  /**
   * Atualiza cache da conversa com última mensagem
   */
  private async updateConversationCache(conversationId: string, lastMessage: string) {
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessage,
        lastMessageAt: new Date(),
        updatedAt: new Date()
      }
    });
  }

  /**
   * Verifica e arquiva mensagens antigas se necessário
   */
  private async checkAndArchiveOldMessages(conversationId: string) {
    // Verificar se há mensagens antigas demais na camada HOT
    const hotMessageCount = await this.prisma.message.count({
      where: {
        conversationId,
        storageTier: StorageTier.HOT
      }
    });

    // Se há mais de 100 mensagens na camada HOT, mover algumas para WARM
    if (hotMessageCount > 100) {
      const messagesToMove = await this.prisma.message.findMany({
        where: {
          conversationId,
          storageTier: StorageTier.HOT
        },
        orderBy: { createdAt: 'asc' },
        take: 50
      });

      await this.prisma.message.updateMany({
        where: {
          id: { in: messagesToMove.map(m => m.id) }
        },
        data: { storageTier: StorageTier.WARM }
      });
    }
  }

  /**
   * Busca mensagens do armazenamento frio (simulado)
   */
  private async getColdStorageMessages(where: any, options: MessageQueryOptions): Promise<any[]> {
    // Em uma implementação real, isso buscaria de S3 ou sistema de arquivos
    // Por enquanto, retornamos array vazio
    this.logger.warn('Cold storage messages requested - not implemented yet');
    return [];
  }

  /**
   * Gera resumo da conversa usando IA (simulado)
   */
  private async generateSummary(messages: any[]): Promise<{
    text: string;
    keyPoints: string[];
    sentiment: string;
    tags: string[];
  }> {
    // Implementar com OpenAI, Claude, ou similar
    // Por enquanto, retorna resumo básico
    const messageTexts = messages.map(m => `${m.sender}: ${m.content}`).join('\n');
    
    return {
      text: `Conversa com ${messages.length} mensagens. Cliente: ${messages[0]?.content?.substring(0, 100)}...`,
      keyPoints: ['Interesse em produto', 'Dúvidas sobre preço'],
      sentiment: 'neutro',
      tags: ['vendas', 'duvidas']
    };
  }
}
