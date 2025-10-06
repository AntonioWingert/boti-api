import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MessagesService } from '../messages/messages.service';
import { ClientsService } from '../clients/clients.service';
import { ChatbotsService } from '../chatbots/chatbots.service';
import { IWhatsAppProvider, WhatsAppProviderConfig } from './interfaces/whatsapp-provider.interface';
import { WhatsAppProviderFactory, WhatsAppProviderType } from './factories/whatsapp-provider.factory';
import { WhatsappSessionService } from './whatsapp-session.service';
import { EventsService } from '../events/events.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ConversationStatus, MessageSender, MessageType } from '@prisma/client';
import { ChatbotFlowService } from '../chatbot/chatbot-flow.service';
import { ConversationManagerService } from '../chatbot/conversation-manager.service';
import { WhatsappResponseService } from '../chatbot/whatsapp-response.service';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private whatsappProvider: IWhatsAppProvider | null;
  private isInitializing = false; // Prevenir múltiplas inicializações simultâneas
  private pendingWelcomeMessages: Array<{conversationId: string, phoneNumber: string}> = [];
  private currentSessionId: string | null = null;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private messagesService: MessagesService,
    private clientsService: ClientsService,
    private chatbotsService: ChatbotsService,
    private chatbotFlowService: ChatbotFlowService,
    private conversationManagerService: ConversationManagerService,
    private whatsappResponseService: WhatsappResponseService,
    private eventsService: EventsService,
    private notificationsService: NotificationsService,
  ) {
    // Inicialização automática no startup
    this.initializeOnStartup();
  }

  /**
   * Inicializa o WhatsApp automaticamente no startup
   */
  private async initializeOnStartup() {
    try {
      this.logger.log('🚀 Starting WhatsApp auto-initialization...');
      
      // Aguardar um pouco para o banco estar pronto
      setTimeout(async () => {
        await this.autoReconnectSessions();
      }, 5000);
      
    } catch (error) {
      this.logger.error('Error in startup initialization:', error);
    }
  }

  /**
   * Reconecta sessões automaticamente
   */
  private async autoReconnectSessions() {
    try {
      this.logger.log('🔄 Checking for sessions to reconnect...');
      
      // Buscar sessões que estavam conectadas antes do restart
      const sessions = await this.prisma.whatsAppSession.findMany({
        where: {
          active: true,
          status: {
            in: ['CONNECTED', 'CONNECTING']
          }
        },
        include: { company: true }
      });

      this.logger.log(`📱 Found ${sessions.length} sessions to reconnect`);

      for (const session of sessions) {
        try {
          this.logger.log(`🔄 Reconnecting session: ${session.sessionName} (${session.company.name})`);
          
          // Atualizar status para CONNECTING
          await this.prisma.whatsAppSession.update({
            where: { id: session.id },
            data: { status: 'CONNECTING' }
          });

          // Inicializar provider com esta sessão
          const sessionProvider = await this.initializeProviderForSession(session.id);
          
          // Atribuir o provider à instância principal se não estiver definido
          if (!this.whatsappProvider && sessionProvider) {
            this.whatsappProvider = sessionProvider;
            this.logger.log(`✅ Provider assigned to main instance for session: ${session.sessionName}`);
          }
          
        } catch (error) {
          this.logger.error(`❌ Failed to reconnect session ${session.sessionName}:`, error);
          
          // Marcar como desconectada se falhar
          await this.prisma.whatsAppSession.update({
            where: { id: session.id },
            data: { 
              status: 'DISCONNECTED',
              error: error.message
            }
          });
        }
      }
      
      // Iniciar monitoramento de sessões desconectadas
      this.startDisconnectedSessionsMonitor();
      
    } catch (error) {
      this.logger.error('Error in auto-reconnect:', error);
    }
  }

  /**
   * Monitora sessões desconectadas e tenta reconectar automaticamente
   */
  private startDisconnectedSessionsMonitor() {
    this.logger.log('🔍 Starting disconnected sessions monitor...');
    
    // Verificar a cada 30 segundos
    setInterval(async () => {
      try {
        await this.checkAndReconnectDisconnectedSessions();
        
        // Verificar se há mensagens pendentes e WhatsApp está conectado
        if (this.pendingWelcomeMessages.length > 0) {
          const isConnected = await this.isActuallyConnected();
          if (isConnected) {
            this.logger.log(`🔄 WhatsApp connected, processing ${this.pendingWelcomeMessages.length} pending welcome messages`);
            await this.processPendingWelcomeMessages();
          }
        }
      } catch (error) {
        this.logger.error('Error in disconnected sessions monitor:', error);
      }
    }, 30000); // 30 segundos
  }

  /**
   * Verifica e reconecta sessões desconectadas
   */
  private async checkAndReconnectDisconnectedSessions() {
    try {
      // Buscar sessões ativas que estão desconectadas
      const disconnectedSessions = await this.prisma.whatsAppSession.findMany({
        where: {
          active: true,
          status: 'DISCONNECTED',
          // Só tentar reconectar se não foi desconectada manualmente
          error: {
            not: 'Manual disconnect'
          }
        },
        include: { company: true }
      });

      if (disconnectedSessions.length > 0) {
        this.logger.log(`🔄 Found ${disconnectedSessions.length} disconnected sessions to reconnect`);
        
        for (const session of disconnectedSessions) {
          try {
            this.logger.log(`🔄 Attempting to reconnect: ${session.sessionName} (${session.company.name})`);
            
            // Atualizar status para CONNECTING
            await this.prisma.whatsAppSession.update({
              where: { id: session.id },
              data: { 
                status: 'CONNECTING',
                error: null // Limpar erro anterior
              }
            });

            // Tentar reconectar
            await this.initializeProviderForSession(session.id);
            
          } catch (error) {
            this.logger.error(`❌ Failed to reconnect session ${session.sessionName}:`, error);
            
            // Manter como desconectada se falhar
            await this.prisma.whatsAppSession.update({
              where: { id: session.id },
              data: { 
                status: 'DISCONNECTED',
                error: error.message
              }
            });
          }
        }
      }
    } catch (error) {
      this.logger.error('Error checking disconnected sessions:', error);
    }
  }

  /**
   * Regenera uma sessão específica (método público)
   */
  async regenerateSession(sessionId: string) {
    try {
      this.logger.log(`🔄 Regenerating session: ${sessionId}`);
      
      // Buscar a sessão
      const session = await this.prisma.whatsAppSession.findUnique({
        where: { id: sessionId },
        include: { company: true }
      });

      if (!session) {
        throw new Error('Session not found');
      }

      // Marcar como CONNECTING
      await this.prisma.whatsAppSession.update({
        where: { id: sessionId },
        data: { 
          status: 'CONNECTING',
          error: null
        }
      });

      // Inicializar provider
      await this.initializeProviderForSession(sessionId);
      
      this.logger.log(`✅ Session ${sessionId} regenerated successfully`);
      
      return {
        success: true,
        sessionId,
        sessionName: session.sessionName,
        companyName: session.company.name,
        message: 'Session regenerated successfully'
      };
      
    } catch (error) {
      this.logger.error(`Error regenerating session ${sessionId}:`, error);
      
      // Marcar como erro se falhar
      await this.prisma.whatsAppSession.update({
        where: { id: sessionId },
        data: { 
          status: 'ERROR',
          error: error.message
        }
      });
      
      throw error;
    }
  }

  /**
   * Desconecta uma sessão manualmente (evita reconexão automática)
   */
  async disconnectSession(sessionId: string) {
    try {
      this.logger.log(`🔌 Manually disconnecting session: ${sessionId}`);
      
      // Marcar como desconectada manualmente
      await this.prisma.whatsAppSession.update({
        where: { id: sessionId },
        data: { 
          status: 'DISCONNECTED',
          error: 'Manual disconnect'
        }
      });

      // Notificar mudança de status
      if (this.eventsService) {
        await this.eventsService.notifySessionStatusChange(sessionId, 'DISCONNECTED');
      }
      
      this.logger.log(`✅ Session ${sessionId} manually disconnected`);
      return { success: true, message: 'Session disconnected manually' };
    } catch (error) {
      this.logger.error(`❌ Error disconnecting session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Verifica se é uma nova conversa (sem mensagens do bot ainda)
   */
  private async isNewConversation(conversationId: string): Promise<boolean> {
    try {
      const messageCount = await this.prisma.message.count({
        where: {
          conversationId: conversationId,
          sender: MessageSender.CHATBOT
        }
      });
      
      this.logger.log(`🔍 Conversation ${conversationId} has ${messageCount} bot messages`);
      return messageCount === 0;
    } catch (error) {
      this.logger.error(`❌ Error checking if conversation is new:`, error);
      return false;
    }
  }

  private async isFirstMessageAfterReconnect(conversationId: string, phoneNumber: string): Promise<boolean> {
    try {
      // Verificar se houve uma mensagem do bot nas últimas 5 minutos
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      
      const recentBotMessage = await this.prisma.message.findFirst({
        where: {
          conversationId: conversationId,
          sender: MessageSender.CHATBOT,
          createdAt: {
            gte: fiveMinutesAgo
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      // Se não há mensagem recente do bot, é provável que seja após reconnect
      if (!recentBotMessage) {
        this.logger.log(`🔄 No recent bot messages found for conversation ${conversationId} - likely after reconnect`);
        return true;
      }

      this.logger.log(`✅ Recent bot message found for conversation ${conversationId} - not after reconnect`);
      return false;
    } catch (error) {
      this.logger.error(`❌ Error checking if first message after reconnect:`, error);
      return false;
    }
  }

  /**
   * Processa mensagens de boas-vindas pendentes quando o WhatsApp conectar
   */
  private async processPendingWelcomeMessages() {
    if (this.pendingWelcomeMessages.length === 0) {
      return;
    }

    this.logger.log(`📬 Processing ${this.pendingWelcomeMessages.length} pending welcome messages`);
    
    const messagesToProcess = [...this.pendingWelcomeMessages];
    this.pendingWelcomeMessages = []; // Limpar a lista

    for (const pendingMessage of messagesToProcess) {
      try {
        this.logger.log(`📤 Sending pending welcome message to ${pendingMessage.phoneNumber}`);
        await this.sendWelcomeMessage(pendingMessage.conversationId, pendingMessage.phoneNumber);
      } catch (error) {
        this.logger.error(`❌ Error sending pending welcome message to ${pendingMessage.phoneNumber}:`, error);
        // Re-adicionar à lista se falhar
        this.pendingWelcomeMessages.push(pendingMessage);
      }
    }
  }

  /**
   * Envia mensagem de boas-vindas para nova conversa
   */
  private async sendWelcomeMessage(conversationId: string, phoneNumber: string) {
    try {
      this.logger.log(`👋 Sending welcome message to ${phoneNumber} for conversation ${conversationId}`);
      
      // Buscar conversa com nó atual
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          currentNode: {
            include: {
              options: true,
              outgoingConnections: {
                include: {
                  targetNode: true
                }
              }
            }
          }
        }
      });

      if (!conversation?.currentNode) {
        this.logger.error(`❌ Conversation or current node not found for ${conversationId}`);
        return;
      }

      // Processar nó inicial para gerar resposta de boas-vindas
      // Primeiro, processar o nó inicial (MESSAGE)
      const initialResponse = await this.chatbotFlowService.processMessage(
        conversationId,
        '', // Mensagem vazia para nó inicial
        phoneNumber
      );

      // Se o nó inicial é MESSAGE e tem próximo nó OPTION, navegar automaticamente
      if (conversation.currentNode.nodeType === 'MESSAGE') {
        // Buscar próximo nó
        const nextNode = await this.prisma.flowNode.findFirst({
          where: {
            flowId: conversation.currentFlowId!,
            active: true,
            nodeType: 'OPTION'
          },
          include: {
            options: true,
            outgoingConnections: {
              include: {
                targetNode: true
              }
            }
          }
        });

        if (nextNode) {
          this.logger.log(`🔄 Auto-navigating from MESSAGE to OPTION node: ${nextNode.id}`);
          
          // Atualizar conversa para o nó de opções
          await this.prisma.conversation.update({
            where: { id: conversationId },
            data: {
              currentNodeId: nextNode.id,
              updatedAt: new Date()
            }
          });

        // Enviar saudação do nó MESSAGE antes das opções (se houver)
        if (initialResponse.text) {
          // Salvar saudação do bot
          await this.messagesService.createMessage({
            conversationId: conversationId,
            content: initialResponse.text,
            sender: MessageSender.CHATBOT,
            messageType: MessageType.TEXT
          });

          // Enviar saudação de texto
          await this.whatsappResponseService.sendResponse(phoneNumber, { type: 'text', text: initialResponse.text });
        }

          // Processar o nó de opções para gerar resposta com opções
          const response = await this.chatbotFlowService.processMessage(
            conversationId,
            '', // Mensagem vazia
            phoneNumber
          );

        this.logger.log(`✅ Generated welcome response with options:`, {
            text: response.text,
            type: response.type,
            optionsCount: response.options?.length || response.buttons?.length || 0
          });

        // Salvar resposta do bot (registro do texto das opções)
        await this.messagesService.createMessage({
          conversationId: conversationId,
          content: response.text || 'Bem-vindo!',
          sender: MessageSender.CHATBOT,
          messageType: MessageType.TEXT
        });

        // Enviar via WhatsApp: apenas a mensagem interativa com botões
        await this.whatsappResponseService.sendResponse(phoneNumber, response);
          
          this.logger.log(`✅ Welcome message with options sent to ${phoneNumber}`);
          return;
        }
      }

      // Fallback: usar resposta inicial se não houver nó de opções
      this.logger.log(`🤖 Welcome response generated (fallback):`, {
        text: initialResponse.text,
        type: initialResponse.type,
        optionsCount: initialResponse.options?.length || initialResponse.buttons?.length || 0
      });

      // Salvar resposta do bot
      await this.messagesService.createMessage({
        conversationId: conversationId,
        content: initialResponse.text || 'Bem-vindo!',
        sender: MessageSender.CHATBOT,
        messageType: MessageType.TEXT
      });

      // Enviar via WhatsApp apenas a saudação de texto (fallback)
      await this.whatsappResponseService.sendResponse(phoneNumber, initialResponse);
      
      this.logger.log(`✅ Welcome message sent to ${phoneNumber}`);
    } catch (error) {
      this.logger.error(`❌ Error sending welcome message:`, error);
    }
  }

  /**
   * Inicializa provider para uma sessão específica
   */
  private async initializeProviderForSession(sessionId: string) {
    try {
      const session = await this.prisma.whatsAppSession.findUnique({
        where: { id: sessionId },
        include: { company: true }
      });

      if (!session) {
        throw new Error('Session not found');
      }

      // Criar provider para esta sessão
      const providerType = this.configService.get<string>('WHATSAPP_PROVIDER', 'baileys') as WhatsAppProviderType;
      
      // Criar nome único da sessão: ID + Nome (ex: "cmgee8aah0001q8u2xawrmwb7-Sessão Teste")
      const uniqueSessionName = `${session.id}-${session.sessionName}`;
      
      this.logger.log(`🔧 initializeProviderForSession - Session name: ${uniqueSessionName}`);
      this.logger.log(`🔍 Session data:`, { id: session.id, name: session.sessionName });
      
      const config: WhatsAppProviderConfig = {
        apiUrl: this.configService.get<string>('WHATSAPP_API_URL'),
        accessToken: this.configService.get<string>('WHATSAPP_ACCESS_TOKEN'),
        phoneNumberId: this.configService.get<string>('WHATSAPP_PHONE_NUMBER_ID'),
        verifyToken: this.configService.get<string>('WHATSAPP_VERIFY_TOKEN'),
        sessionName: uniqueSessionName,
        qrCode: this.configService.get<boolean>('WHATSAPP_QR_CODE', true),
        headless: this.configService.get<boolean>('WHATSAPP_HEADLESS', true),
      };

      const sessionProvider = WhatsAppProviderFactory.createProvider(providerType, config);
      
      // Configurar sessão
      if (sessionProvider.setSessionId) {
        sessionProvider.setSessionId(sessionId);
        this.currentSessionId = sessionId;
      }
      
      if (sessionProvider.setSessionService) {
        const sessionService = new WhatsappSessionService(this.prisma);
        sessionProvider.setSessionService(sessionService);
      }

      // Configurar EventsService para notificações em tempo real
      if (sessionProvider.setEventsService) {
        sessionProvider.setEventsService(this.eventsService);
      }

      // Registrar callback
      if (sessionProvider.setMessageCallback) {
        this.logger.log(`🔗 Registering message callback for session: ${session.sessionName}`);
        sessionProvider.setMessageCallback(this.handleBaileysMessage.bind(this));
        this.logger.log(`✅ Message callback registered successfully`);
      } else {
        this.logger.warn(`⚠️ setMessageCallback not available for session: ${session.sessionName}`);
      }

      // Inicializar
      if (sessionProvider.initialize) {
        await sessionProvider.initialize();
        this.logger.log(`✅ Session ${session.sessionName} reconnected successfully`);
      }

      // ATRIBUIR O PROVIDER À INSTÂNCIA PRINCIPAL
      this.whatsappProvider = sessionProvider;
      this.logger.log(`✅ WhatsApp provider assigned to main instance for session: ${session.sessionName}`);

      // Configurar o provider no WhatsappResponseService
      this.whatsappResponseService.setWhatsAppProvider(sessionProvider);
      this.logger.log(`✅ WhatsappResponseService configured with session provider for ${session.sessionName}`);

      return sessionProvider;

    } catch (error) {
      this.logger.error(`Error initializing session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Verifica se o provider está inicializado e conectado
   */
  private isProviderInitialized(): boolean {
    if (!this.whatsappProvider) {
      return false;
    }
    
    // Para Baileys, verificar se está realmente conectado
    if (this.whatsappProvider.isReady && typeof this.whatsappProvider.isReady === 'function') {
      return this.whatsappProvider.isReady();
    }
    
    return true; // Para outros providers, assumir que está OK se existe
  }

  /**
   * Verifica o status da conexão WhatsApp
   */
  async checkConnectionStatus() {
    try {
      this.logger.log('🔍 Checking WhatsApp connection status...');
      
      // Verificar sessões no banco
      const sessions = await this.prisma.whatsAppSession.findMany({
        include: { 
          company: true
        }
      });
      
      this.logger.log(`📊 Total sessions in database: ${sessions.length}`);
      sessions.forEach(session => {
        this.logger.log(`  - ${session.sessionName}: ${session.status} (${session.active ? 'active' : 'inactive'}) - Company: ${session.company?.name || 'N/A'}`);
      });
      
      // Verificar se há provider inicializado
      if (this.whatsappProvider) {
        this.logger.log('✅ WhatsApp provider is initialized');
      } else {
        this.logger.warn('❌ WhatsApp provider is not initialized');
      }
      
      return {
        sessions: sessions.length,
        activeSessions: sessions.filter(s => s.status === 'CONNECTED').length,
        providerInitialized: !!this.whatsappProvider
      };
      
    } catch (error) {
      this.logger.error('Error checking connection status:', error);
      throw error;
    }
  }

  /**
   * Garante que o provider está inicializado antes de usar
   */
  private async ensureProviderInitialized() {
    // VERIFICAR SE JÁ EXISTE UMA SESSÃO ATIVA
    if (this.whatsappProvider && this.isProviderInitialized()) {
      this.logger.log('✅ Provider already initialized and ready');
      return;
    }

    // VERIFICAR SE HÁ SESSÕES ATIVAS NO BANCO
    const activeSessions = await this.prisma.whatsAppSession.findMany({
      where: { 
        status: 'CONNECTED'
      }
    });

    if (activeSessions.length > 0) {
      this.logger.log(`🔍 Found ${activeSessions.length} active sessions - reconnecting instead of creating new provider`);
      // Reconectar sessão existente em vez de criar nova
      await this.autoReconnectSessions();
      
      // VERIFICAR SE A RECONEXÃO FUNCIONOU
      if (this.whatsappProvider && this.isProviderInitialized()) {
        this.logger.log('✅ Provider reconnected successfully');
        return;
      } else {
        this.logger.log('⚠️ Reconnection failed, initializing new provider...');
        await this.initializeProvider();
      }
      return;
    }

    // VERIFICAR SE HÁ SESSÕES DESCONECTADAS QUE PODEM SER RECONECTADAS
    const disconnectedSessions = await this.prisma.whatsAppSession.findMany({
      where: { 
        status: 'DISCONNECTED'
      }
    });

    if (disconnectedSessions.length > 0) {
      this.logger.log(`🔍 Found ${disconnectedSessions.length} disconnected sessions - attempting to reconnect`);
      // Tentar reconectar sessões desconectadas
      await this.autoReconnectSessions();
      
      // VERIFICAR SE A RECONEXÃO FUNCIONOU
      if (this.whatsappProvider && this.isProviderInitialized()) {
        this.logger.log('✅ Provider reconnected successfully');
        return;
      } else {
        this.logger.log('⚠️ Reconnection failed, initializing new provider...');
        await this.initializeProvider();
      }
      return;
    }

    if (!this.isProviderInitialized()) {
      this.logger.log('🔧 Provider not initialized, initializing...');
      await this.initializeProvider();
    } else {
      this.logger.log('✅ Provider already initialized and ready');
    }
  }

  /**
   * Inicializa o provider do WhatsApp sob demanda
   */
  async initializeProvider() {
    // PREVENIR MÚLTIPLAS INSTÂNCIAS - Singleton pattern
    if (this.whatsappProvider && this.isProviderInitialized()) {
      this.logger.log('🔒 Provider already initialized and connected - skipping initialization');
      return this.whatsappProvider;
    }

    // PREVENIR INICIALIZAÇÕES SIMULTÂNEAS
    if (this.isInitializing) {
      this.logger.log('⏳ Provider initialization already in progress - waiting...');
      // Aguardar um pouco e verificar novamente
      await new Promise(resolve => setTimeout(resolve, 2000));
      if (this.whatsappProvider && this.isProviderInitialized()) {
        this.logger.log('✅ Provider initialized by another process');
        return this.whatsappProvider;
      }
    }

    // VERIFICAR SE JÁ EXISTE UM PROVIDER FUNCIONANDO
    if (this.whatsappProvider && this.whatsappProvider.isReady && this.whatsappProvider.isReady()) {
      this.logger.log('✅ Provider already exists and is ready - reusing existing instance');
      return this.whatsappProvider;
    }

    this.isInitializing = true;
    this.logger.log('🚀 Starting provider initialization...');

    try {
      // Se já existe um provider, mas não está conectado, limpar antes de criar novo
      if (this.whatsappProvider) {
        this.logger.log('🧹 Cleaning up existing disconnected provider');
        try {
          if (this.whatsappProvider.disconnect) {
            await this.whatsappProvider.disconnect();
          }
        } catch (error) {
          this.logger.warn('Error disconnecting old provider:', error);
        }
        this.whatsappProvider = null;
      }

      const providerType = this.configService.get<string>('WHATSAPP_PROVIDER', 'baileys') as WhatsAppProviderType;
      
      // BUSCAR SESSÃO EXISTENTE PARA USAR SEU NOME E ID
      const existingSession = await this.prisma.whatsAppSession.findFirst({
        where: { 
          status: { in: ['CONNECTED', 'DISCONNECTED'] }
        },
        orderBy: { createdAt: 'desc' }
      });

      // Criar nome único da sessão: ID + Nome (ex: "cmgee8aah0001q8u2xawrmwb7-Sessão Teste")
      // SEMPRE usar sessão do banco se existir, ignorar .env
      const sessionName = existingSession 
        ? `${existingSession.id}-${existingSession.sessionName}`
        : `default-session-${Date.now()}`; // Nome único se não houver sessão
      
      this.logger.log(`🔧 Session name determined: ${sessionName}`);
      this.logger.log(`🔍 Existing session:`, existingSession ? { id: existingSession.id, name: existingSession.sessionName } : 'None');
      
      const config: WhatsAppProviderConfig = {
        apiUrl: this.configService.get<string>('WHATSAPP_API_URL'),
        accessToken: this.configService.get<string>('WHATSAPP_ACCESS_TOKEN'),
        phoneNumberId: this.configService.get<string>('WHATSAPP_PHONE_NUMBER_ID'),
        verifyToken: this.configService.get<string>('WHATSAPP_VERIFY_TOKEN'),
        // Configurações específicas do provedor
        sessionName: sessionName,
        qrCode: this.configService.get<boolean>('WHATSAPP_QR_CODE', true),
        headless: this.configService.get<boolean>('WHATSAPP_HEADLESS', true),
      };
      this.logger.log(`🏭 Creating NEW WhatsApp provider: ${providerType}`);
      this.whatsappProvider = WhatsAppProviderFactory.createProvider(providerType, config);
      this.logger.log(`✅ WhatsApp provider created: ${providerType}`);
      
      // Definir sessionId padrão para Baileys se não estiver definido
      if (providerType === WhatsAppProviderType.BAILEYS && this.whatsappProvider.setSessionId) {
        const defaultSessionId = this.configService.get<string>('WHATSAPP_SESSION_ID', 'default-session');
        this.whatsappProvider.setSessionId(defaultSessionId);
        this.logger.log(`Session ID set to: ${defaultSessionId}`);
      }
      
      // Inicializar o provider (especialmente importante para Baileys)
      if (this.whatsappProvider.initialize) {
        this.logger.log(`🔄 Initializing WhatsApp provider: ${providerType}`);
        await this.whatsappProvider.initialize();
        this.logger.log(`✅ WhatsApp provider initialized: ${providerType}`);
      }
      
      // Configurar EventsService para notificações em tempo real
      if (this.whatsappProvider.setEventsService) {
        this.logger.log('📡 Setting events service for main provider');
        this.whatsappProvider.setEventsService(this.eventsService);
        this.logger.log('✅ Events service configured for main provider');
      }

      // Registrar callback para processar mensagens do Baileys APÓS inicialização
      if (providerType === WhatsAppProviderType.BAILEYS && this.whatsappProvider.setMessageCallback) {
        this.whatsappProvider.setMessageCallback(this.handleBaileysMessage.bind(this));
        this.logger.log('✅ Message callback registered for Baileys AFTER initialization');
      } else if (providerType === WhatsAppProviderType.BAILEYS) {
        this.logger.warn('❌ setMessageCallback not available on Baileys provider');
      }
      
      // Configurar o provider no WhatsappResponseService
      this.whatsappResponseService.setWhatsAppProvider(this.whatsappProvider);
      this.logger.log('✅ WhatsappResponseService configured with provider');
      
      return this.whatsappProvider;
    } catch (error) {
      this.logger.error(`Failed to initialize WhatsApp provider: ${error.message}`);
      throw error;
    } finally {
      this.isInitializing = false;
      this.logger.log('🏁 Provider initialization process completed');
    }
  }

  private getWhatsappConfig() {
    return {
      apiUrl: this.configService.get<string>('WHATSAPP_API_URL'),
      accessToken: this.configService.get<string>('WHATSAPP_ACCESS_TOKEN'),
      phoneNumberId: this.configService.get<string>('WHATSAPP_PHONE_NUMBER_ID'),
      verifyToken: this.configService.get<string>('WHATSAPP_VERIFY_TOKEN'),
    };
  }

  async verifyWebhook(mode: string, token: string, challenge: string) {
    try {
      await this.ensureProviderInitialized();
      if (!this.whatsappProvider) {
        throw new Error('WhatsApp provider not initialized');
      }
      return await this.whatsappProvider.verifyWebhook(mode, token, challenge);
    } catch (error) {
      this.logger.error('Webhook verification failed:', error);
      throw error;
    }
  }

  async handleWebhook(body: any) {
    try {
      this.logger.log('🔔 Webhook received:', JSON.stringify(body, null, 2));
      
      await this.ensureProviderInitialized();
      if (!this.whatsappProvider) {
        throw new Error('WhatsApp provider not initialized');
      }
      const { message, contact, metadata } = this.whatsappProvider.processWebhookData(body);

      this.logger.log('📨 Processed webhook data:', { message, contact, metadata });

      if (!message || !contact) {
        this.logger.warn('❌ Invalid webhook data received - no message or contact');
        return;
      }

      const phoneNumber = contact.phone;
      const messageText = message.text || '';

      this.logger.log(`📱 Received message from ${phoneNumber}: ${messageText}`);

      // 1. Buscar ou criar cliente
      let client = await this.clientsService.findByPhone(phoneNumber);

      if (!client) {
        // Criar cliente - usar primeira empresa ativa
        const companies = await this.prisma.company.findMany({ where: { active: true } });
        
        if (companies.length === 0) {
          this.logger.error('No active companies found');
          return;
        }

        client = await this.clientsService.create({
          name: contact.profile?.name || `Cliente ${phoneNumber}`,
          phone: phoneNumber,
          companyId: companies[0].id,
        });
      }

      // 2. Buscar ou criar conversa com fluxo
      // TODO: Implementar busca do sessionId baseado no phoneNumber ou metadata
      const conversation = await this.conversationManagerService.getOrCreateConversation(
        phoneNumber,
        client.companyId
        // sessionId será implementado quando tivermos como identificar a sessão
      );

      // 3. Salvar mensagem do cliente
      await this.messagesService.createMessage({
        conversationId: conversation.id,
        content: messageText,
        sender: MessageSender.CLIENT,
        messageType: MessageType.TEXT
      });

      // 4. Processar mensagem no fluxo do chatbot
      this.logger.log(`🤖 Processing message in chatbot flow for conversation: ${conversation.id}`);
      const response = await this.chatbotFlowService.processMessage(
        conversation.id,
        messageText,
        phoneNumber
      );

      this.logger.log(`🤖 Chatbot response generated:`, response);

      // 5. Salvar resposta do chatbot
      this.logger.log(`💾 Saving chatbot response to database`);
      await this.messagesService.createMessage({
        conversationId: conversation.id,
        content: response.text || 'Resposta do chatbot',
        sender: MessageSender.CHATBOT,
        messageType: MessageType.TEXT
      });

      // 6. Enviar resposta via WhatsApp
      this.logger.log(`📤 Sending response via WhatsApp to ${phoneNumber}`);
      
      // Garantir que o WhatsappResponseService tem o provider correto
      if (!this.whatsappResponseService.isProviderConfigured()) {
        this.logger.log('🔧 Configuring WhatsappResponseService with current provider');
        if (!this.whatsappProvider) {
          throw new Error('WhatsApp provider not initialized');
        }
        this.whatsappResponseService.setWhatsAppProvider(this.whatsappProvider);
      }
      
      await this.whatsappResponseService.sendResponse(phoneNumber, response);

      this.logger.log(`Response sent to ${phoneNumber}`);

    } catch (error) {
      this.logger.error('Error handling webhook:', error);
      
      // Enviar mensagem de erro se possível
      try {
        if (!this.whatsappProvider) {
          this.logger.warn('WhatsApp provider not available for error message');
          return;
        }
        const { contact } = this.whatsappProvider.processWebhookData(body);
        if (contact?.phone) {
          await this.whatsappResponseService.sendErrorMessage(contact.phone);
        }
      } catch (errorResponse) {
        this.logger.error('Error sending error message:', errorResponse);
      }
    }
  }


  private async processWithChatbot(conversationId: string, messageText: string) {
    try {
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          chatbot: true,
          client: true,
        },
      });

      if (!conversation?.chatbot) {
        return;
      }

      // Buscar fluxo padrão do chatbot usando query direta
      const flowQuery = `
        SELECT * FROM flows 
        WHERE chatbotId = ? AND isDefault = true AND active = true 
        LIMIT 1
      `;
      const flows = await this.prisma.$queryRawUnsafe(flowQuery, conversation.chatbotId);
      const flow = Array.isArray(flows) ? flows[0] : null;

      if (!flow) {
        this.logger.log('No default flow found for chatbot');
        return;
      }

      // Buscar nó inicial do fluxo
      const startNodeQuery = `
        SELECT * FROM flow_nodes 
        WHERE flowId = ? AND isStart = true AND active = true 
        LIMIT 1
      `;
      const startNodes = await this.prisma.$queryRawUnsafe(startNodeQuery, flow.id);
      const startNode = Array.isArray(startNodes) ? startNodes[0] : null;

      if (!startNode) {
        this.logger.log('No start node found in flow');
        return;
      }

      let response = '';

      // Processar mensagem do usuário
      const userMessage = messageText.toLowerCase().trim();
      
      // Buscar nó de opções
      const optionsNodeQuery = `
        SELECT * FROM flow_nodes 
        WHERE flowId = ? AND nodeType = 'OPTION' AND active = true 
        LIMIT 1
      `;
      const optionsNodes = await this.prisma.$queryRawUnsafe(optionsNodeQuery, flow.id);
      const optionsNode = Array.isArray(optionsNodes) ? optionsNodes[0] : null;
      
      if (optionsNode) {
        // Buscar opções do nó
        const optionsQuery = `
          SELECT * FROM flow_options 
          WHERE nodeId = ? AND active = true 
          ORDER BY \`order\` ASC
        `;
        const options = await this.prisma.$queryRawUnsafe(optionsQuery, optionsNode.id);
        
        // Buscar conexão correspondente
        let targetNodeId = null;
        if (Array.isArray(options)) {
          for (const option of options) {
            // Verificar se a mensagem do usuário corresponde à opção
            const optionText = option.text.toLowerCase();
            if (userMessage.includes(optionText) || 
                optionText.includes(userMessage) ||
                userMessage === (options.indexOf(option) + 1).toString()) {
              
              const connectionQuery = `
                SELECT targetNodeId FROM flow_connections 
                WHERE sourceNodeId = ? AND optionId = ? 
                LIMIT 1
              `;
              const connections = await this.prisma.$queryRawUnsafe(connectionQuery, optionsNode.id, option.id);
              if (Array.isArray(connections) && connections.length > 0) {
                targetNodeId = connections[0].targetNodeId;
                break;
              }
            }
          }
        }
        
        // Se encontrou nó de destino, buscar sua mensagem
        if (targetNodeId) {
          const targetNodeQuery = `
            SELECT * FROM flow_nodes 
            WHERE id = ? AND active = true 
            LIMIT 1
          `;
          const targetNodes = await this.prisma.$queryRawUnsafe(targetNodeQuery, targetNodeId);
          const targetNode = Array.isArray(targetNodes) ? targetNodes[0] : null;
          
          if (targetNode) {
            response = targetNode.message || 'Desculpe, não entendi sua mensagem.';
            
            // Verificar se é um nó de encerramento
            if (targetNode.isEnd) {
              await this.closeConversation(conversationId);
              this.logger.log(`Conversation ${conversationId} closed by user choice`);
            }
          }
        } else {
          // Se não encontrou opção correspondente, mostrar opções novamente
          response = startNode.message || 'Olá! Bem-vindo ao nosso atendimento.';
          if (Array.isArray(options) && options.length > 0) {
            response += '\n\nEscolha uma das opções:';
            options.forEach((option, index) => {
              response += `\n${index + 1}. ${option.text}`;
            });
          }
        }
      } else {
        // Se não há nó de opções, enviar mensagem inicial
        response = startNode.message || 'Olá! Bem-vindo ao nosso atendimento.';
      }

      // Enviar resposta
      if (response) {
        await this.sendMessage(conversation.client.phone, response);
        this.logger.log(`Chatbot response sent: ${response}`);
      }

    } catch (error) {
      this.logger.error('Error processing with chatbot:', error);
    }
  }

  /**
   * Encerra uma conversa
   */
  private async closeConversation(conversationId: string) {
    try {
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: {
          status: 'FINISHED',
          finishedAt: new Date(),
          updatedAt: new Date()
        }
      });
      
      this.logger.log(`Conversation ${conversationId} marked as finished`);
    } catch (error) {
      this.logger.error('Error closing conversation:', error);
    }
  }

  /**
   * Verifica e encerra conversas inativas
   */
  async checkAndCloseInactiveConversations() {
    try {
      const inactiveThreshold = new Date();
      inactiveThreshold.setHours(inactiveThreshold.getHours() - 24); // 24 horas de inatividade

      const inactiveConversations = await this.prisma.conversation.findMany({
        where: {
          status: 'ACTIVE',
          updatedAt: {
            lt: inactiveThreshold
          }
        }
      });

      for (const conversation of inactiveConversations) {
        await this.closeConversation(conversation.id);
        this.logger.log(`Conversation ${conversation.id} closed due to inactivity`);
      }

      return inactiveConversations.length;
    } catch (error) {
      this.logger.error('Error checking inactive conversations:', error);
      return 0;
    }
  }

  async sendMessage(phoneNumber: string, message: string) {
    try {
      // Verificar se é tentativa de envio para grupo
      if (this.isGroupPhoneNumber(phoneNumber)) {
        this.logger.warn(`Attempted to send message to group ${phoneNumber} - blocked`);
        throw new Error('Sending messages to groups is not allowed');
      }

      await this.ensureProviderInitialized();
      
      // Verificar conexão antes de enviar
      const isConnected = await this.isActuallyConnected();
      if (!isConnected) {
        this.logger.warn(`WhatsApp not connected, cannot send message to ${phoneNumber}`);
        throw new Error('WhatsApp connection is not available. Please check the connection status.');
      }

      if (!this.whatsappProvider) {
        throw new Error('WhatsApp provider not initialized');
      }
      const response = await this.whatsappProvider.sendMessage(phoneNumber, message);
      this.logger.log(`Message sent to ${phoneNumber}: ${response.messages[0].id}`);
      return response;
    } catch (error) {
      this.logger.error('Error sending message:', error);
      
      // Se for erro de conexão, tentar marcar como desconectado
      if (error.message.includes('not connected') || error.message.includes('connection')) {
        this.logger.warn('Connection error detected, marking as disconnected');
        // Aqui você pode adicionar lógica para marcar a sessão como desconectada
      }
      
      throw error;
    }
  }

  async sendTemplateMessage(phoneNumber: string, templateName: string, parameters: string[] = []) {
    try {
      // Verificar se é tentativa de envio para grupo
      if (this.isGroupPhoneNumber(phoneNumber)) {
        this.logger.warn(`Attempted to send template message to group ${phoneNumber} - blocked`);
        throw new Error('Sending template messages to groups is not allowed');
      }

      await this.ensureProviderInitialized();
      if (!this.whatsappProvider) {
        throw new Error('WhatsApp provider not initialized');
      }
      const response = await this.whatsappProvider.sendTemplateMessage(phoneNumber, templateName, parameters);
      this.logger.log(`Template message sent to ${phoneNumber}: ${response.messages[0].id}`);
      return response;
    } catch (error) {
      this.logger.error('Error sending template message:', error);
      throw error;
    }
  }

  async sendMediaMessage(phoneNumber: string, mediaType: 'image' | 'audio' | 'video' | 'document', mediaUrl: string, caption?: string) {
    try {
      // Verificar se é tentativa de envio para grupo
      if (this.isGroupPhoneNumber(phoneNumber)) {
        this.logger.warn(`Attempted to send media message to group ${phoneNumber} - blocked`);
        throw new Error('Sending media messages to groups is not allowed');
      }

      await this.ensureProviderInitialized();
      if (!this.whatsappProvider) {
        throw new Error('WhatsApp provider not initialized');
      }
      const response = await this.whatsappProvider.sendMediaMessage(phoneNumber, mediaType, mediaUrl, caption);
      this.logger.log(`Media message sent to ${phoneNumber}: ${response.messages[0].id}`);
      return response;
    } catch (error) {
      this.logger.error('Error sending media message:', error);
      throw error;
    }
  }

  async getMessageStatus(messageId: string) {
    try {
      await this.ensureProviderInitialized();
      if (!this.whatsappProvider) {
        throw new Error('WhatsApp provider not initialized');
      }
      return await this.whatsappProvider.getMessageStatus(messageId);
    } catch (error) {
      this.logger.error('Error getting message status:', error);
      throw error;
    }
  }

  async getProfile(phoneNumber: string) {
    try {
      await this.ensureProviderInitialized();
      if (!this.whatsappProvider) {
        throw new Error('WhatsApp provider not initialized');
      }
      return await this.whatsappProvider.getProfile(phoneNumber);
    } catch (error) {
      this.logger.error('Error getting profile:', error);
      throw error;
    }
  }

  /**
   * Verifica se o número de telefone é de um grupo
   */
  private isGroupPhoneNumber(phoneNumber: string): boolean {
    // Grupos geralmente têm formato específico ou contêm caracteres especiais
    // Esta é uma verificação adicional de segurança
    return phoneNumber.includes('@g.us') || phoneNumber.includes('group');
  }

  /**
   * Manipula mensagens recebidas do Baileys (callback)
   */
  private async handleBaileysMessage(message: any, contact: any) {
    try {
      this.logger.log(`🎯 handleBaileysMessage called with:`, { 
        phone: contact.phone, 
        text: message.text,
        messageId: message.id 
      });
      
      this.logger.log(`📞 Full message object:`, JSON.stringify(message, null, 2));
      this.logger.log(`👤 Full contact object:`, JSON.stringify(contact, null, 2));
      
      // Verificação adicional de segurança para grupos
      if (this.isGroupPhoneNumber(contact.phone)) {
        this.logger.log(`Additional group check - ignoring message from ${contact.phone}`);
        return;
      }

      this.logger.log(`Processing Baileys message from ${contact.phone}: ${message.text}`);

      const phoneNumber = contact.phone;
      const messageText = message.text || '';

      // 1. Identificar empresa baseada no número do WhatsApp que recebeu a mensagem
      this.logger.log(`🔍 Identifying company for WhatsApp number that received message from: ${phoneNumber}`);
      
      // Buscar sessão ativa do WhatsApp para identificar a empresa
      // Primeiro, tentar encontrar sessão CONNECTED
      let activeSession = await this.prisma.whatsAppSession.findFirst({
        where: { 
          status: 'CONNECTED',
          active: true 
        },
        include: { company: true }
      });
      
      // Se não encontrar CONNECTED, buscar qualquer sessão ativa
      if (!activeSession) {
        this.logger.log('🔍 No CONNECTED session found, looking for any active session...');
        activeSession = await this.prisma.whatsAppSession.findFirst({
          where: { 
            active: true 
          },
          include: { company: true }
        });
      }

      if (!activeSession) {
        this.logger.error('❌ No active WhatsApp session found');
        
        // Debug: listar todas as sessões
        const allSessions = await this.prisma.whatsAppSession.findMany({
          include: { company: true }
        });
        this.logger.log('🔍 All sessions:', allSessions.map(s => ({
          id: s.id,
          sessionName: s.sessionName,
          status: s.status,
          active: s.active,
          company: s.company.name
        })));
        
        return;
      }

      this.logger.log(`🏢 Company identified: ${activeSession.company.name} (${activeSession.companyId})`);

      // 2. Buscar ou criar cliente
      let client = await this.clientsService.findByPhone(phoneNumber);

      if (!client) {
        // Criar cliente na empresa identificada
        client = await this.clientsService.create({
          name: contact.name || `Cliente ${phoneNumber}`,
          phone: phoneNumber,
          companyId: activeSession.companyId,
        });
        this.logger.log(`✅ Client created in company: ${activeSession.company.name}`);
      } else {
        this.logger.log(`👤 Existing client found in company: ${client.companyId}`);
      }

      // 3. Buscar ou criar conversa com fluxo
      this.logger.log(`🔍 Getting or creating conversation for ${phoneNumber} in company ${client.companyId}`);
      const conversation = await this.conversationManagerService.getOrCreateConversation(
        phoneNumber,
        client.companyId
      );

      this.logger.log(`💬 Conversation found/created:`, {
        id: conversation.id,
        clientId: conversation.clientId,
        companyId: conversation.companyId,
        chatbotId: conversation.chatbotId,
        status: conversation.status
      });

      // 3.1. Verificar se é uma nova conversa e enviar mensagem de boas-vindas
      const isNewConversation = await this.isNewConversation(conversation.id);
      const isFirstMessageAfterReconnect = await this.isFirstMessageAfterReconnect(conversation.id, phoneNumber);
      
      if (isNewConversation || isFirstMessageAfterReconnect) {
        this.logger.log(`🆕 New conversation or first message after reconnect detected - sending welcome message`);
        
        // GARANTIR QUE O PROVIDER ESTÁ INICIALIZADO
        await this.ensureProviderInitialized();
        
        // Verificar se o WhatsApp está conectado antes de enviar
        if (!this.whatsappProvider) {
          this.logger.warn(`⚠️ WhatsApp provider not initialized, saving welcome message for later`);
          this.pendingWelcomeMessages.push({conversationId: conversation.id, phoneNumber});
          return; // Não processar a mensagem do cliente
        }
        
        const isConnected = await this.whatsappProvider.isActuallyConnected?.();
        if (!isConnected) {
          this.logger.log(`⚠️ WhatsApp not connected, saving welcome message for later`);
          this.pendingWelcomeMessages.push({conversationId: conversation.id, phoneNumber});
          return; // Não processar a mensagem do cliente
        }
        
        // Aguardar um pouco para garantir que o provider está totalmente inicializado
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        await this.sendWelcomeMessage(conversation.id, phoneNumber);
        return; // Não processar a mensagem do cliente ainda
      }

      // 4. Salvar mensagem do cliente
      this.logger.log(`💾 Saving message to conversation ${conversation.id}`);
      await this.messagesService.createMessage({
        conversationId: conversation.id,
        content: messageText,
        sender: MessageSender.CLIENT,
        messageType: MessageType.TEXT
      });

      // 5. Processar com chatbot
      this.logger.log(`🤖 Processing message in chatbot flow for conversation: ${conversation.id}`);
      const response = await this.chatbotFlowService.processMessage(
        conversation.id,
        messageText,
        phoneNumber
      );

      this.logger.log(`🤖 Chatbot response generated:`, response);

      // 6. Salvar resposta do chatbot
      this.logger.log(`💾 Saving chatbot response to database`);
      await this.messagesService.createMessage({
        conversationId: conversation.id,
        content: response.text || 'Resposta do chatbot',
        sender: MessageSender.CHATBOT,
        messageType: MessageType.TEXT
      });

      // 7. Enviar resposta via WhatsApp
      this.logger.log(`📤 Sending response via WhatsApp to ${phoneNumber}`);
      
      // Verificar se já temos um provider conectado (não recriar)
      if (!this.whatsappProvider || !this.isProviderInitialized()) {
        this.logger.log('🔧 Provider not initialized, initializing...');
        await this.ensureProviderInitialized();
      }
      
      // Garantir que o WhatsappResponseService tem o provider correto
      if (!this.whatsappResponseService.isProviderConfigured()) {
        this.logger.log('🔧 Configuring WhatsappResponseService with current provider');
        if (!this.whatsappProvider) {
          throw new Error('WhatsApp provider not initialized');
        }
        this.whatsappResponseService.setWhatsAppProvider(this.whatsappProvider);
      }
      
      await this.whatsappResponseService.sendResponse(phoneNumber, response);

      this.logger.log(`Response sent to ${phoneNumber}`);

    } catch (error) {
      this.logger.error('Error processing Baileys message:', error);
    }
  }

  /**
   * Verifica se o provider atual está realmente conectado
   */
  async isActuallyConnected(): Promise<boolean> {
    try {
      if (!this.isProviderInitialized()) {
        return false;
      }

      // Verificar se o provider tem método para verificar conexão
      if (this.whatsappProvider && typeof this.whatsappProvider.isReady === 'function') {
        const isConnected = this.whatsappProvider.isReady();
        
        // Se conectou e há mensagens pendentes, processar
        if (isConnected && this.pendingWelcomeMessages.length > 0) {
          this.logger.log(`🔄 WhatsApp connected, processing ${this.pendingWelcomeMessages.length} pending welcome messages`);
          // Processar em background para não bloquear
          setImmediate(() => this.processPendingWelcomeMessages());
        }
        
        return isConnected;
      }

      // Fallback: assumir desconectado se não conseguir verificar
      return false;
    } catch (error) {
      this.logger.error('Error checking actual connection status:', error);
      return false;
    }
  }

  /**
   * Retorna o tipo do provider atual
   */
  getProviderType(): string {
    return this.configService.get<string>('WHATSAPP_PROVIDER', 'baileys');
  }

  /**
   * Sincroniza o status da sessão atual com o banco de dados
   */
  async syncCurrentSessionStatus() {
    try {
      if (!this.isProviderInitialized()) {
        this.logger.log('Provider not initialized, skipping sync');
        return;
      }

      const isActuallyConnected = await this.isActuallyConnected();
      const sessionId = this.currentSessionId || this.configService.get<string>('WHATSAPP_SESSION_ID', 'default-session');
      
      // Usar o WhatsappSessionService para sincronizar
      const sessionService = new WhatsappSessionService(this.prisma);
      await sessionService.syncSessionStatus(sessionId, isActuallyConnected);
      
      this.logger.log(`Session status synced: ${isActuallyConnected ? 'CONNECTED' : 'DISCONNECTED'}`);
    } catch (error) {
      this.logger.error('Error syncing current session status:', error);
    }
  }

  /**
   * Sincroniza todas as sessões ativas com seus status reais
   */
  async syncAllSessionsStatus() {
    try {
      const sessionService = new WhatsappSessionService(this.prisma);
      
      // Para cada sessão ativa, verificar se está realmente conectada
      await sessionService.syncAllActiveSessions(async (sessionId: string) => {
        // Se for a sessão atual, usar o provider atual
        const currentSessionId = this.currentSessionId || this.configService.get<string>('WHATSAPP_SESSION_ID', 'default-session');
        if (sessionId === currentSessionId) {
          return await this.isActuallyConnected();
        }
        
        // Para outras sessões, assumir desconectado por enquanto
        // (em uma implementação mais robusta, você manteria referências a múltiplos providers)
        this.logger.log(`Checking external session ${sessionId} - assuming disconnected`);
        return false;
      });
      
      this.logger.log('All sessions status synced');
    } catch (error) {
      this.logger.error('Error syncing all sessions status:', error);
    }
  }

  /**
   * Gera QR code para uma sessão específica
   */
  async generateQRCodeForSession(sessionId: string): Promise<string> {
    try {
      this.logger.log(`🔄 Generating QR code for session: ${sessionId}`);
      
      // Buscar dados da sessão para usar nome único
      const session = await this.prisma.whatsAppSession.findUnique({
        where: { id: sessionId }
      });

      if (!session) {
        throw new Error('Session not found');
      }

      // Criar um novo provider para esta sessão específica
      const providerType = this.configService.get<string>('WHATSAPP_PROVIDER', 'baileys') as WhatsAppProviderType;
      this.logger.log(`🔧 Provider type: ${providerType}`);
      
      // Usar nome único da sessão: ID + Nome
      const uniqueSessionName = `${session.id}-${session.sessionName}`;
      this.logger.log(`🔧 Using unique session name: ${uniqueSessionName}`);
      
      const config: WhatsAppProviderConfig = {
        apiUrl: this.configService.get<string>('WHATSAPP_API_URL'),
        accessToken: this.configService.get<string>('WHATSAPP_ACCESS_TOKEN'),
        phoneNumberId: this.configService.get<string>('WHATSAPP_PHONE_NUMBER_ID'),
        verifyToken: this.configService.get<string>('WHATSAPP_VERIFY_TOKEN'),
        sessionName: uniqueSessionName, // Usar nome único em vez do .env
        qrCode: this.configService.get<boolean>('WHATSAPP_QR_CODE', true),
        headless: this.configService.get<boolean>('WHATSAPP_HEADLESS', true),
      };

      this.logger.log(`⚙️ Config:`, {
        sessionName: config.sessionName,
        qrCode: config.qrCode,
        headless: config.headless
      });

      // Criar provider temporário para esta sessão
      this.logger.log(`🏭 Creating provider for session: ${sessionId}`);
      const sessionProvider = WhatsAppProviderFactory.createProvider(providerType, config);
      
      // Definir sessionId e sessionService
      if (sessionProvider.setSessionId) {
        this.logger.log(`📱 Setting session ID: ${sessionId}`);
        sessionProvider.setSessionId(sessionId);
        this.currentSessionId = sessionId;
      }
      
      // Configurar sessionService se disponível
      if (sessionProvider.setSessionService) {
        this.logger.log(`🔧 Setting session service`);
        const sessionService = new WhatsappSessionService(this.prisma);
        sessionProvider.setSessionService(sessionService);
      }

      // Configurar EventsService para notificações em tempo real
      if (sessionProvider.setEventsService) {
        this.logger.log(`📡 Setting events service for session: ${sessionId}`);
        sessionProvider.setEventsService(this.eventsService);
        this.logger.log(`✅ Events service configured for session ${sessionId}`);
      }

      // Registrar callback para esta sessão
      if (sessionProvider.setMessageCallback) {
        this.logger.log(`📞 Setting message callback for session: ${sessionId}`);
        sessionProvider.setMessageCallback(this.handleBaileysMessage.bind(this));
        this.logger.log(`✅ Message callback registered for session ${sessionId}`);
      }

      // Tornar este provider o principal e configurar no WhatsappResponseService
      this.whatsappProvider = sessionProvider;
      this.logger.log(`✅ WhatsApp provider assigned to main instance for session: ${sessionId}`);
      this.whatsappResponseService.setWhatsAppProvider(sessionProvider);
      this.logger.log(`✅ WhatsappResponseService configured with session provider for session ${sessionId}`);

      // Gerar QR code
      if (sessionProvider.generateQRCode) {
        this.logger.log(`🚀 Calling generateQRCode on provider`);
        const qrCode = await sessionProvider.generateQRCode();
        this.logger.log(`✅ QR code generated for session ${sessionId}, length: ${qrCode?.length}`);
        return qrCode;
      } else {
        this.logger.error(`❌ QR code generation not supported by this provider`);
        throw new Error('QR code generation not supported by this provider');
      }
    } catch (error) {
      this.logger.error(`❌ Error generating QR code for session ${sessionId}:`, error);
      this.logger.error(`❌ Error stack:`, error.stack);
      throw error;
    }
  }
}