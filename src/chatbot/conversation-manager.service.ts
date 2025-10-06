import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ConversationManagerService {
  private readonly logger = new Logger(ConversationManagerService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Busca ou cria uma conversa ativa para o cliente
   * @param phoneNumber Número do telefone
   * @param companyId ID da empresa
   * @param sessionId ID da sessão WhatsApp (para buscar chatbot vinculado)
   */
  async getOrCreateConversation(phoneNumber: string, companyId: string, sessionId?: string) {
    try {
      this.logger.log(`🔍 Getting or creating conversation for phone: ${phoneNumber}, company: ${companyId}`);
      
      // 1. Buscar cliente
      let client = await this.prisma.client.findFirst({
        where: { 
          phone: phoneNumber,
          companyId: companyId
        }
      });

      this.logger.log(`👤 Client found:`, client ? { id: client.id, name: client.name } : 'Not found');

      // 2. Criar cliente se não existir
      if (!client) {
        this.logger.log(`➕ Creating new client for ${phoneNumber}`);
        client = await this.prisma.client.create({
          data: {
            phone: phoneNumber,
            name: `Cliente ${phoneNumber}`,
            companyId: companyId,
            active: true
          }
        });
        this.logger.log(`✅ Client created:`, { id: client.id, name: client.name });
      }

      // 3. Buscar conversa ativa
      this.logger.log(`🔍 Searching for active conversation for client: ${client.id}`);
      let conversation = await this.prisma.conversation.findFirst({
        where: {
          clientId: client.id,
          status: 'ACTIVE',
          companyId: companyId
        },
        include: {
          currentFlow: true,
          currentNode: true
        }
      });

      this.logger.log(`💬 Conversation found:`, conversation ? { 
        id: conversation.id, 
        status: conversation.status,
        chatbotId: conversation.chatbotId,
        currentFlowId: conversation.currentFlowId,
        currentNodeId: conversation.currentNodeId
      } : 'Not found');

      // 4. Criar conversa se não existir
      if (!conversation) {
        this.logger.log(`➕ Creating new conversation for client: ${client.id}`);
        
        let chatbot: any = null;
        
        // Se temos sessionId, buscar chatbot vinculado à sessão
        if (sessionId) {
          this.logger.log(`🔗 Searching for chatbot linked to session: ${sessionId}`);
          const session = await this.prisma.whatsAppSession.findUnique({
            where: { id: sessionId },
            include: { chatbot: true }
          });
          
          if (session?.chatbot && session.chatbot.active) {
            chatbot = session.chatbot;
            this.logger.log(`🤖 Found linked chatbot:`, { 
              id: chatbot.id, 
              name: chatbot.name 
            });
          }
        }
        
        // Se não encontrou chatbot vinculado, buscar chatbot ativo da empresa
        if (!chatbot) {
          this.logger.log(`🤖 Searching for active chatbot in company: ${companyId}`);
          chatbot = await this.prisma.chatbot.findFirst({
            where: {
              companyId: companyId,
              active: true
            },
            include: {
              flows: {
                where: { active: true },
                include: {
                  nodes: {
                    where: { 
                      active: true,
                      isStart: true 
                    }
                  }
                }
              }
            }
          });
        }

        this.logger.log(`🤖 Chatbot found:`, chatbot ? { 
          id: chatbot.id, 
          name: chatbot.name,
          flowsCount: chatbot.flows?.length || 0
        } : 'Not found');

        if (!chatbot?.flows?.[0]?.nodes?.[0]) {
          this.logger.error(`❌ No active chatbot flow found for company: ${companyId}`);
          throw new Error('No active chatbot flow found');
        }

        const startNode = chatbot.flows[0].nodes[0];
        this.logger.log(`🚀 Start node found:`, { id: startNode.id, message: startNode.message });

        this.logger.log(`💬 Creating conversation with chatbot: ${chatbot.id}`);
        conversation = await this.prisma.conversation.create({
          data: {
            clientId: client.id,
            companyId: companyId,
            chatbotId: chatbot.id,
            currentFlowId: chatbot.flows[0].id,
            currentNodeId: startNode.id,
            status: 'ACTIVE'
          },
          include: {
            currentFlow: true,
            currentNode: true
          }
        });

        this.logger.log(`✅ Conversation created:`, { 
          id: conversation.id, 
          status: conversation.status,
          chatbotId: conversation.chatbotId,
          currentFlowId: conversation.currentFlowId,
          currentNodeId: conversation.currentNodeId
        });
      }

      return conversation;

    } catch (error) {
      this.logger.error('Error getting or creating conversation:', error);
      throw error;
    }
  }

  /**
   * Atualiza o status da conversa
   */
  async updateConversationStatus(conversationId: string, status: 'ACTIVE' | 'PAUSED' | 'FINISHED' | 'ESCALATED') {
    return this.prisma.conversation.update({
      where: { id: conversationId },
      data: { 
        status,
        updatedAt: new Date()
      }
    });
  }

  /**
   * Pausa uma conversa
   */
  async pauseConversation(conversationId: string) {
    return this.updateConversationStatus(conversationId, 'PAUSED');
  }

  /**
   * Fecha uma conversa
   */
  async closeConversation(conversationId: string) {
    return this.updateConversationStatus(conversationId, 'FINISHED');
  }

  /**
   * Retoma uma conversa pausada
   */
  async resumeConversation(conversationId: string) {
    return this.updateConversationStatus(conversationId, 'ACTIVE');
  }

  /**
   * Busca conversas ativas de uma empresa
   */
  async getActiveConversations(companyId: string) {
    return this.prisma.conversation.findMany({
      where: {
        companyId: companyId,
        status: 'ACTIVE'
      },
      include: {
        client: true,
        currentFlow: true,
        currentNode: true
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });
  }

  /**
   * Busca conversas de um cliente
   */
  async getClientConversations(clientId: string) {
    return this.prisma.conversation.findMany({
      where: { clientId },
      include: {
        currentFlow: true,
        currentNode: true
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });
  }
}
