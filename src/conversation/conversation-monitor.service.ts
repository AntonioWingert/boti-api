import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';

@Injectable()
export class ConversationMonitorService implements OnModuleInit {
  private readonly logger = new Logger(ConversationMonitorService.name);
  private readonly INACTIVITY_TIMEOUT = 2 * 60 * 1000; // 2 minutos em millisegundos
  private intervalId: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappService: WhatsappService,
  ) {}

  onModuleInit() {
    this.startMonitoring();
  }

  onModuleDestroy() {
    this.stopMonitoring();
  }

  /**
   * Inicia o monitoramento de conversas
   */
  private startMonitoring() {
    this.logger.log('Starting conversation monitoring...');
    
    // Verificar a cada 30 segundos
    this.intervalId = setInterval(() => {
      this.checkInactiveConversations();
    }, 30 * 1000);
  }

  /**
   * Para o monitoramento de conversas
   */
  private stopMonitoring() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.logger.log('Conversation monitoring stopped');
    }
  }

  /**
   * Verifica conversas inativas (executado a cada 30 segundos)
   */
  async checkInactiveConversations() {
    try {
      this.logger.log('Checking for inactive conversations...');
      
      const inactiveConversations = await this.findInactiveConversations();
      
      if (inactiveConversations.length === 0) {
        this.logger.log('No inactive conversations found');
        return;
      }

      this.logger.log(`Found ${inactiveConversations.length} inactive conversations`);

      for (const conversation of inactiveConversations) {
        await this.closeInactiveConversation(conversation);
      }

    } catch (error) {
      this.logger.error('Error checking inactive conversations:', error);
    }
  }

  /**
   * Busca conversas que estão inativas há mais de 2 minutos
   */
  private async findInactiveConversations() {
    const cutoffTime = new Date(Date.now() - this.INACTIVITY_TIMEOUT);
    
    return await this.prisma.conversation.findMany({
      where: {
        status: 'ACTIVE',
        updatedAt: {
          lt: cutoffTime
        }
      },
      include: {
        client: true,
        chatbot: true
      }
    });
  }

  /**
   * Encerra uma conversa inativa
   */
  private async closeInactiveConversation(conversation: any) {
    try {
      this.logger.log(`Closing inactive conversation: ${conversation.id}`);

      // Verificar se o WhatsApp está conectado antes de tentar enviar mensagem
      const isConnected = await this.whatsappService.isActuallyConnected();
      
      if (isConnected) {
        // Enviar mensagem de encerramento - usar mensagem configurada no chatbot se disponível
        const timeoutMessage = this.generateTimeoutMessage(conversation.chatbot);
        await this.whatsappService.sendMessage(conversation.client.phone, timeoutMessage);
        this.logger.log(`Timeout message sent to ${conversation.client.phone}`);
      } else {
        this.logger.warn(`WhatsApp not connected, skipping timeout message for conversation ${conversation.id}`);
      }

      // Marcar conversa como encerrada (independente da conexão)
      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          status: 'FINISHED',
          finishedAt: new Date(),
          updatedAt: new Date()
        }
      });

      this.logger.log(`Conversation ${conversation.id} closed due to inactivity`);

    } catch (error) {
      this.logger.error(`Error closing conversation ${conversation.id}:`, error);
      
      // Mesmo com erro, tentar marcar como encerrada para evitar loops
      try {
        await this.prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            status: 'FINISHED',
            finishedAt: new Date(),
            updatedAt: new Date()
          }
        });
        this.logger.log(`Conversation ${conversation.id} marked as finished despite error`);
      } catch (dbError) {
        this.logger.error(`Failed to update conversation ${conversation.id} status:`, dbError);
      }
    }
  }

  /**
   * Gera mensagem de encerramento por timeout
   */
  private generateTimeoutMessage(chatbot?: any): string {
    // Se o chatbot tem uma mensagem de finalização configurada, usar ela
    if (chatbot?.autoEndMessage && chatbot.autoEndMessage.trim()) {
      this.logger.log(`Using custom auto-end message from chatbot: ${chatbot.name}`);
      return chatbot.autoEndMessage;
    }

    // Fallback para mensagens padrão se não houver mensagem configurada
    this.logger.log('No custom auto-end message configured, using default messages');
    const messages = [
      'Obrigado por entrar em contato conosco! 😊\n\nComo não houve atividade recente, vou encerrar nossa conversa. Se precisar de mais alguma coisa, é só me chamar novamente!\n\nTenha um ótimo dia! 👋',
      
      'Olá! 👋\n\nNotei que não houve atividade em nossa conversa. Vou encerrá-la por enquanto, mas fique à vontade para me chamar quando precisar!\n\nAté logo! 😊',
      
      'Obrigado pelo seu contato! 🙏\n\nComo não recebi resposta recente, vou finalizar nossa conversa. Se tiver mais dúvidas, estarei aqui para ajudar!\n\nAté a próxima! ✨'
    ];

    // Escolher mensagem aleatória para variar
    const randomIndex = Math.floor(Math.random() * messages.length);
    return messages[randomIndex];
  }

  /**
   * Método manual para encerrar uma conversa específica
   */
  async closeConversationManually(conversationId: string, reason: string = 'Manual closure') {
    try {
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { 
          client: true,
          chatbot: true 
        }
      });

      if (!conversation) {
        throw new Error('Conversation not found');
      }

      if (conversation.status === 'FINISHED') {
        this.logger.log(`Conversation ${conversationId} is already finished`);
        return;
      }

      // Enviar mensagem de encerramento - usar mensagem configurada no chatbot se disponível
      const closureMessage = this.generateTimeoutMessage(conversation.chatbot);
      await this.whatsappService.sendMessage(conversation.client.phone, closureMessage);

      // Marcar como encerrada
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: {
          status: 'FINISHED',
          finishedAt: new Date(),
          updatedAt: new Date()
        }
      });

      this.logger.log(`Conversation ${conversationId} closed manually: ${reason}`);

    } catch (error) {
      this.logger.error(`Error manually closing conversation ${conversationId}:`, error);
      throw error;
    }
  }

  /**
   * Estatísticas de conversas
   */
  async getConversationStats() {
    const now = new Date();
    const twoMinutesAgo = new Date(now.getTime() - this.INACTIVITY_TIMEOUT);

    const [active, inactive, finished] = await Promise.all([
      this.prisma.conversation.count({
        where: { status: 'ACTIVE' }
      }),
      this.prisma.conversation.count({
        where: {
          status: 'ACTIVE',
          updatedAt: { lt: twoMinutesAgo }
        }
      }),
      this.prisma.conversation.count({
        where: { status: 'FINISHED' }
      })
    ]);

    return {
      active,
      inactive,
      finished,
      total: active + finished,
      lastCheck: now
    };
  }
}
