import { Injectable, Logger } from '@nestjs/common';
import { IWhatsAppProvider, WhatsAppMessage, WhatsAppContact, WhatsAppWebhookData, WhatsAppSendMessageResponse } from '../interfaces/whatsapp-provider.interface';
import type { WhatsAppProviderConfig } from '../interfaces/whatsapp-provider.interface';
import { makeWASocket, DisconnectReason, useMultiFileAuthState, ConnectionState } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as qrcode from 'qrcode-terminal';
import P from 'pino';
import * as fs from 'fs';
import * as path from 'path';
import { SessionStatus } from '@prisma/client';
import { EventsService } from '../../events/events.service';

/**
 * Implementação usando Baileys (biblioteca de terceiros)
 * Baileys é uma biblioteca popular para WhatsApp Web API
 * 
 * Vantagens:
 * - Gratuito
 * - Estável
 * - Suporte a mídia
 * - TypeScript nativo
 * - Comunidade ativa
 */
@Injectable()
export class BaileysWhatsAppProvider implements IWhatsAppProvider {
  private readonly logger = new Logger(BaileysWhatsAppProvider.name);
  private config: WhatsAppProviderConfig;
  private socket: any = null;
  private isConnected = false;
  private authState: any = null;
  private sessionId: string | null = null;
  private sessionService: any = null;
  private eventsService: EventsService | null = null;
  private connectionStartTime: Date | null = null;
  private isFirstConnection = true;
  private messageCallback: ((message: any, contact: any) => Promise<void>) | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isReconnecting = false;
  private connectionTimeout: NodeJS.Timeout | null = null;
  private maxConnectionTime = 5 * 60 * 1000; // 5 minutos máximo para conectar
  private lastDisconnectReason: number | null = null;

  constructor(config: WhatsAppProviderConfig) {
    this.config = config;
  }

  setSessionService(service: any) {
    this.sessionService = service;
  }

  setEventsService(service: EventsService) {
    this.eventsService = service;
  }

  setSessionId(sessionId: string) {
    this.sessionId = sessionId;
    this.logger.log(`📱 Session ID set to: ${sessionId}`);
  }

  setMessageCallback(callback: (message: any, contact: any) => Promise<void>) {
    this.messageCallback = callback;
  }

  async initialize(): Promise<void> {
    try {
      this.logger.log('Initializing Baileys WhatsApp provider...');
      this.clearReconnectTimeout();
      this.clearConnectionTimeout();
      
      if (!this.sessionId) {
        throw new Error('Session ID is required for initialization');
      }

      // Verificar se já existe sessão persistente
      const hasExistingSession = await this.checkExistingSession();
      if (hasExistingSession) {
        this.logger.log('🔄 Found existing persistent session - attempting to reconnect');
      } else {
        this.logger.log('🆕 No existing session found - will require QR code scan');
      }

      // Atualizar status da sessão para CONNECTING
      if (this.sessionService) {
        await this.sessionService.updateStatus(this.sessionId, SessionStatus.CONNECTING);
      }

      // Configurar timeout de conexão (aumentar para 5 minutos)
      this.connectionStartTime = new Date();
      this.connectionTimeout = setTimeout(() => {
        this.logger.warn('Connection timeout reached, marking as failed');
        this.handleConnectionTimeout();
      }, this.maxConnectionTime); // 5 minutos para dar mais tempo
      this.logger.log(`⏰ Connection timeout set for ${this.maxConnectionTime / 1000} seconds`);
      
      // Configurar diretório de sessão
      const sessionPath = this.config.sessionName || `session-${this.sessionId}`;
      const sessionDir = path.join(process.cwd(), 'sessions', sessionPath);
      
      // LIMPAR PASTA ANTIGA SE EXISTIR (chatbot-session)
      const oldSessionDir = path.join(process.cwd(), 'sessions', 'chatbot-session');
      if (fs.existsSync(oldSessionDir) && sessionPath !== 'chatbot-session') {
        this.logger.log(`🧹 Removing old session directory: ${oldSessionDir}`);
        try {
          fs.rmSync(oldSessionDir, { recursive: true, force: true });
          this.logger.log(`✅ Old session directory removed`);
        } catch (error) {
          this.logger.warn(`⚠️ Could not remove old session directory:`, error);
        }
      }
      
      // Criar diretório se não existir
      if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
      }

      // Configurar estado de autenticação com persistência
      this.logger.log(`🔐 Setting up persistent auth state in: ${sessionDir}`);
      const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
      this.authState = state;
      this.logger.log(`✅ Auth state configured for persistent sessions`);

      // Configurar logger
      const logger = P({ level: 'silent' });

      // Criar socket
      this.socket = makeWASocket({
        auth: this.authState,
        printQRInTerminal: this.config.qrCode || true,
        logger,
        browser: ['Chatbot API', 'Chrome', '1.0.0'],
        generateHighQualityLinkPreview: true,
        markOnlineOnConnect: true,
        syncFullHistory: false,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        retryRequestDelayMs: 250,
        maxMsgRetryCount: 3,
        connectTimeoutMs: 120000, // 2 minutos
      });

      // Event listeners
      this.setupEventListeners(saveCreds);

      this.logger.log('✅ Baileys WhatsApp provider initialized successfully');
      this.logger.log(`📱 Session: ${this.sessionId}`);
      this.logger.log(`📁 Session directory: ${sessionDir}`);
      this.logger.log(`🔧 Config:`, {
        qrCode: this.config.qrCode,
        headless: this.config.headless,
        sessionName: this.config.sessionName
      });
    } catch (error) {
      this.logger.error('Failed to initialize Baileys:', error);
      throw error;
    }
  }

  private setupEventListeners(saveCreds: () => Promise<void>) {
    // Evento de conexão
    this.socket.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
      try {
        const { connection, lastDisconnect, qr } = update;
        
        this.logger.log(`🔄 Connection update:`, {
          connection,
          hasQR: !!qr,
          hasLastDisconnect: !!lastDisconnect,
          sessionId: this.sessionId
        });
      
      if (qr) {
        this.logger.log('📱 QR Code generated - scan with WhatsApp');
        this.logger.log(`📊 QR Code length: ${qr.length}`);
        
        if (this.config.qrCode) {
          // Salvar QR Code como string (será convertido para base64 no frontend)
          if (this.sessionService && this.sessionId) {
            this.logger.log(`💾 Saving QR code to session: ${this.sessionId}`);
            await this.sessionService.updateQRCode(this.sessionId, qr);
            this.logger.log(`✅ QR code saved successfully`);
          }
          
          // Notificar frontend sobre QR Code gerado
          if (this.eventsService && this.sessionId) {
            this.logger.log(`📡 Notifying frontend about QR code`);
            await this.eventsService.notifyQRCodeGenerated(this.sessionId, qr);
          }
        }
      }

      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
        const disconnectReason = (lastDisconnect?.error as Boom)?.output?.statusCode;
        
        // Armazenar motivo da desconexão
        this.lastDisconnectReason = disconnectReason;
        
        this.logger.log(`🔌 Connection closed - Reason: ${disconnectReason}, Should reconnect: ${shouldReconnect}`);
        this.logger.log(`📊 Current state: isConnected=${this.isConnected}, isReconnecting=${this.isReconnecting}, attempts=${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
        
        // Log detalhado do erro
        if (lastDisconnect?.error) {
          this.logger.log(`🔍 Disconnect error details:`, {
            message: lastDisconnect.error.message,
            statusCode: disconnectReason,
            output: (lastDisconnect.error as Boom)?.output
          });
        }
        
        if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
          // VERIFICAR SE JÁ ESTÁ TENTANDO RECONECTAR
          if (this.isReconnecting) {
            this.logger.log('⏳ Reconnection already in progress - skipping duplicate attempt');
            return;
          }
          
          this.logger.log(`🔄 Connection dropped, scheduling reconnection... (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
          
          // Atualizar status para DISCONNECTED
          if (this.sessionService && this.sessionId) {
            try {
              await this.sessionService.updateStatus(this.sessionId, SessionStatus.DISCONNECTED);
              this.logger.log(`✅ Session status updated to DISCONNECTED`);
            } catch (error) {
              this.logger.error(`❌ Error updating session status:`, error);
            }
            
            // Notificar mudança de status
            if (this.eventsService) {
              try {
                await this.eventsService.notifySessionStatusChange(this.sessionId, 'DISCONNECTED');
                this.logger.log(`📡 Disconnected status notified to frontend`);
              } catch (error) {
                this.logger.error(`❌ Error notifying status change:`, error);
              }
            }
          }
          
          // Agendar reconexão automática com delay maior para evitar loops
          this.scheduleReconnect();
        } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          this.logger.error(`❌ Max reconnection attempts (${this.maxReconnectAttempts}) reached. Stopping reconnection.`);
          this.isConnected = false;
          this.isReconnecting = false;
          
          if (this.sessionService && this.sessionId) {
            await this.sessionService.updateStatus(this.sessionId, SessionStatus.ERROR);
            // Notificar erro de conexão
            if (this.eventsService) {
              await this.eventsService.notifyConnectionError(this.sessionId, 'Max reconnection attempts reached');
            }
          }
        } else {
          this.logger.log('🔌 Connection closed, logged out (no reconnection needed)');
          this.isConnected = false;
          this.isReconnecting = false;
          
          if (this.sessionService && this.sessionId) {
            await this.sessionService.disconnectSession(this.sessionId);
            // Notificar desconexão
            if (this.eventsService) {
              await this.eventsService.notifySessionStatusChange(this.sessionId, 'DISCONNECTED');
            }
          }
        }
      } else if (connection === 'open') {
        this.logger.log('✅ Connected to WhatsApp successfully');
        this.logger.log(`📱 Session: ${this.sessionId}`);
        this.logger.log(`👤 User: ${this.socket.user?.id}`);
        // Log da sessão persistente (sessionDir não está disponível aqui)
        this.logger.log(`🔐 Persistent session enabled`);
        
        this.isConnected = true;
        this.isReconnecting = false;
        this.reconnectAttempts = 0; // Reset counter on successful connection
        this.connectionStartTime = new Date();
        this.clearConnectionTimeout(); // Limpar timeout de conexão
        this.clearReconnectTimeout(); // Limpar timeout de reconexão
        this.logger.log(`🧹 Connection timeouts cleared after successful connection`);
        
        // Obter número do telefone conectado
        const phoneNumber = this.socket.user?.id?.split(':')[0];
        this.logger.log(`📞 Phone number: ${phoneNumber}`);
        
        if (this.sessionService && this.sessionId) {
          this.logger.log(`🔄 Updating session ${this.sessionId} to CONNECTED with phone ${phoneNumber}`);
          try {
            await this.sessionService.connectSession(this.sessionId, phoneNumber);
            this.logger.log(`✅ Session ${this.sessionId} updated to CONNECTED`);
            
            // Notificar sucesso de conexão
            if (this.eventsService) {
              this.logger.log(`📡 Emitting connection success event for session ${this.sessionId}`);
              await this.eventsService.notifyConnectionSuccess(this.sessionId, phoneNumber);
              this.logger.log(`📡 Emitting session status change event for session ${this.sessionId}`);
              // Também notificar mudança de status para garantir que o frontend receba
              await this.eventsService.notifySessionStatusChange(this.sessionId, 'CONNECTED', { phoneNumber });
              this.logger.log(`📡 Connection success event emitted for session ${this.sessionId}`);
            } else {
              this.logger.warn(`⚠️ EventsService not available for notifications`);
            }
          } catch (error) {
            this.logger.error(`❌ Error updating session to CONNECTED:`, error);
          }
        } else {
          this.logger.warn(`⚠️ Cannot update session: sessionService=${!!this.sessionService}, sessionId=${this.sessionId}`);
        }
        
        // Log para primeira conexão
        if (this.isFirstConnection) {
          this.logger.log('🆕 First connection established - will ignore old messages');
          this.isFirstConnection = false;
        }
      }
      } catch (error) {
        this.logger.error('Error in connection.update event:', error);
        // Não re-lançar o erro para não quebrar a aplicação
      }
    });

    // Evento de credenciais
    this.socket.ev.on('creds.update', saveCreds);

    // Evento de mensagens recebidas
    this.socket.ev.on('messages.upsert', (m: any) => {
      try {
        this.logger.log('Message received:', m);
      
      // Filtrar mensagens antigas na primeira conexão
      if (this.connectionStartTime && m.messages) {
        const newMessages = m.messages.filter((message: any) => {
          // IGNORAR mensagens enviadas por nós mesmos
          if (message.key.fromMe) {
            this.logger.log(`Ignoring own message: ${message.key.id}`);
            return false;
          }
          
          if (!message.messageTimestamp) return false;
          
          const messageTime = new Date(message.messageTimestamp * 1000);
          const isNewMessage = messageTime >= this.connectionStartTime!;
          
          if (!isNewMessage) {
            this.logger.log(`Ignoring old message from ${message.key.remoteJid} (${messageTime.toISOString()})`);
          }
          
          return isNewMessage;
        });
        
        if (newMessages.length === 0) {
          this.logger.log('All messages filtered out as old messages or own messages');
          return;
        }
        
        // Atualizar o objeto de mensagens com apenas as novas
        m.messages = newMessages;
      }
      
      // Processar apenas mensagens novas
      this.processNewMessages(m);
      } catch (error) {
        this.logger.error('Error in messages.upsert event:', error);
        // Não re-lançar o erro para não quebrar a aplicação
      }
    });

    // Evento de presença
    this.socket.ev.on('presence.update', (presence: any) => {
      this.logger.log('Presence update:', presence);
    });
  }

  /**
   * Processa apenas mensagens novas (filtradas)
   */
  private async processNewMessages(m: any) {
    try {
      if (!m.messages || m.messages.length === 0) {
        return;
      }

      for (const message of m.messages) {
        // Verificação adicional: IGNORAR mensagens enviadas por nós mesmos
        if (message.key.fromMe) {
          this.logger.log(`Ignoring own message in processNewMessages: ${message.key.id}`);
          continue;
        }

        // Processar qualquer tipo de mensagem (texto, mídia, sticker, etc.)
        const from = message.key.remoteJid;
        
        if (from) {
          // Verificar se é mensagem de grupo antes de processar
          if (this.isGroupMessage(from)) {
            this.logger.log(`Ignoring group message from ${from}`);
            continue;
          }
          
          // Extrair texto da mensagem (se houver)
          let text = '';
          if (message.message?.conversation) {
            text = message.message.conversation;
          } else if (message.message?.extendedTextMessage?.text) {
            text = message.message.extendedTextMessage.text;
          } else if (message.message?.imageMessage?.caption) {
            text = message.message.imageMessage.caption;
          } else if (message.message?.videoMessage?.caption) {
            text = message.message.videoMessage.caption;
          } else if (message.message?.documentMessage?.caption) {
            text = message.message.documentMessage.caption;
          } else if (message.message?.stickerMessage) {
            text = '[Sticker]';
          } else if (message.message?.audioMessage) {
            text = '[Áudio]';
          } else if (message.message?.imageMessage) {
            text = '[Imagem]';
          } else if (message.message?.videoMessage) {
            text = '[Vídeo]';
          } else if (message.message?.documentMessage) {
            text = '[Documento]';
          } else {
            text = '[Mensagem não suportada]';
          }
          
          this.logger.log(`Processing new message from ${from}: ${text}`);
          
          // Processar a mensagem
          await this.handleNewMessage(from, text, message);
        }
      }
    } catch (error) {
      this.logger.error('Error processing new messages:', error);
    }
  }

  /**
   * Verifica se o JID é de um grupo
   */
  private isGroupMessage(jid: string): boolean {
    return jid.includes('@g.us');
  }

  /**
   * Manipula uma nova mensagem recebida
   */
  private async handleNewMessage(from: string, text: string, message: any) {
    try {
      // Verificar se é mensagem de grupo
      if (this.isGroupMessage(from)) {
        this.logger.log(`Ignoring group message from ${from}: ${text}`);
        return;
      }

      // Extrair número do telefone
      const phoneNumber = from.split('@')[0];
      
      // Criar objeto de mensagem no formato esperado
      const whatsappMessage = {
        id: message.key.id,
        from: phoneNumber,
        to: this.socket.user?.id?.split(':')[0] || '',
        text: text,
        type: 'text' as const,
        timestamp: message.messageTimestamp * 1000,
        metadata: {
          messageId: message.key.id,
          fromJid: from,
          messageTimestamp: message.messageTimestamp
        }
      };

      const contact = {
        id: phoneNumber,
        phone: phoneNumber,
        name: message.pushName || undefined,
        profile: {
          name: message.pushName || undefined
        }
      };

      // Chamar callback se registrado
      if (this.messageCallback) {
        this.logger.log(`Calling message callback for: ${phoneNumber} - ${text}`);
        await this.messageCallback(whatsappMessage, contact);
      } else {
        this.logger.log(`New message ready for processing: ${phoneNumber} - ${text} (no callback registered)`);
      }
      
    } catch (error) {
      this.logger.error('Error handling new message:', error);
    }
  }

  async verifyWebhook(mode: string, token: string, challenge: string): Promise<string> {
    // Baileys não usa webhook tradicional, usa conexão WebSocket
    // Este método pode ser usado para verificação de configuração
    if (mode === 'subscribe' && token === this.config.verifyToken) {
      this.logger.log('Baileys configuration verified');
      return challenge;
    }
    throw new Error('Baileys verification failed');
  }

  processWebhookData(body: any): { message: any; contact: any; metadata: any } {
    // Baileys processa mensagens via eventos WebSocket, não webhook
    // Este método é mantido para compatibilidade
    return {
      message: body.message || {},
      contact: body.contact || {},
      metadata: body.metadata || {}
    };
  }

  async sendMessage(phoneNumber: string, message: string | any): Promise<any> {
    try {
      // Verificar conexão real antes de tentar enviar
      if (!await this.isActuallyConnected()) {
        this.logger.warn('WhatsApp not connected, attempting to reconnect...');
        
        // Só tentar reconectar se não foi logout (401)
        if (this.lastDisconnectReason === 401) {
          this.logger.warn('WhatsApp logged out (401) - QR code scan required');
          throw new Error('WhatsApp logged out - please scan QR code to reconnect');
        }
        
        await this.attemptReconnection();
        
        // Verificar novamente após tentativa de reconexão
        if (!await this.isActuallyConnected()) {
          throw new Error('WhatsApp not connected - reconnection failed');
        }
      }

      // Verificação adicional: aguardar um pouco para garantir que a conexão está estável
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Verificar novamente antes de enviar
      if (!await this.isActuallyConnected()) {
        this.logger.error('Connection lost during send preparation');
        throw new Error('Connection lost during send preparation');
      }

      const jid = `${phoneNumber}@s.whatsapp.net`;
      
      // Verificar se é tentativa de envio para grupo
      if (this.isGroupMessage(jid)) {
        this.logger.warn(`Attempted to send message to group ${phoneNumber} - blocked`);
        throw new Error('Sending messages to groups is not allowed');
      }
      
      // Verificar mensagens no formato objeto (interativas/template/templateButtons ou texto encapsulado)
      if (typeof message === 'object' && message !== null) {
        const hasTemplate = !!(message as any).template;
        const hasButtons = Array.isArray((message as any).buttons) && (message as any).buttons.length > 0;
        const hasTemplateButtons = Array.isArray((message as any).templateButtons) && (message as any).templateButtons.length > 0;

        // Mensagens interativas (template/buttons) com retry
        if (hasTemplate || hasButtons || hasTemplateButtons) {
          const buttonsCount = hasButtons ? (message as any).buttons.length : 0;
          if (hasButtons) {
            this.logger.log(`📱 Sending interactive message with ${buttonsCount} buttons to ${phoneNumber}`);
            this.logger.log(`📱 Button structure:`, (message as any).buttons);
          } else {
            this.logger.log(`📱 Sending interactive template message to ${phoneNumber}`);
          }

          let attempts = 0;
          const maxAttempts = 3;

          while (attempts < maxAttempts) {
            try {
              attempts++;
              this.logger.log(`📱 Attempt ${attempts}/${maxAttempts} to send interactive message`);

              const textValue = typeof (message as any).text === 'string' ? (message as any).text : '';
              let messageData: any = message;
              if (hasTemplate && !(message as any).templateButtons && !(message as any).buttons) {
                // Compat com formato antigo: manter template
                messageData = { text: textValue, template: (message as any).template };
              }

              this.logger.log(`📱 Sending template/interactive message data:`, messageData);

              const result = await this.socket.sendMessage(jid, messageData);

              this.logger.log(`✅ Interactive message sent to ${phoneNumber}: ${result.key.id}`);
              
              return {
                success: true,
                messageId: result.key.id,
                messages: [{ id: result.key.id, status: 'sent' }]
              };
            } catch (error) {
              this.logger.error(`❌ Attempt ${attempts} failed:`, (error as any)?.message || error);

              if (attempts < maxAttempts) {
                this.logger.log(`🔄 Retrying in 2 seconds...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                if (!await this.isActuallyConnected()) {
                  this.logger.error('❌ Connection lost during retry');
                  throw new Error('Connection lost during retry');
                }
              } else {
                throw error;
              }
            }
          }
        }

        // Objeto com campo text: enviar como texto simples
        if ('text' in (message as any)) {
          const textValue = typeof (message as any).text === 'string' ? (message as any).text : String((message as any).text ?? '');
          const result = await this.socket.sendMessage(jid, { text: textValue });

          this.logger.log(`Message sent to ${phoneNumber}: ${result.key.id}`);
          return {
            success: true,
            messageId: result.key.id,
            messages: [{ id: result.key.id, status: 'sent' }]
          };
        }

        // Objeto sem text/template/buttons/templateButtons: fazer fallback para stringificar
        const fallbackText = JSON.stringify(message);
        const result = await this.socket.sendMessage(jid, { text: fallbackText });
        this.logger.log(`Message sent to ${phoneNumber}: ${result.key.id}`);
        return {
          success: true,
          messageId: result.key.id,
          messages: [{ id: result.key.id, status: 'sent' }]
        };
      }

      // Mensagem de texto simples (string)
      const textMessage = typeof message === 'string' ? message : String(message ?? '');
      const result = await this.socket.sendMessage(jid, { text: textMessage });

      this.logger.log(`Message sent to ${phoneNumber}: ${result.key.id}`);
      return {
        success: true,
        messageId: result.key.id,
        messages: [{ id: result.key.id, status: 'sent' }]
      };
    } catch (error) {
      this.logger.error('Error sending message:', error);
      throw error;
    }
  }

  async sendTemplateMessage(phoneNumber: string, templateName: string, parameters?: string[]): Promise<any> {
    try {
      // Verificar conexão real antes de tentar enviar
      if (!await this.isActuallyConnected()) {
        this.logger.warn('WhatsApp not connected, attempting to reconnect...');
        await this.attemptReconnection();
        
        // Verificar novamente após tentativa de reconexão
        if (!await this.isActuallyConnected()) {
          throw new Error('WhatsApp not connected - reconnection failed');
        }
      }

      const jid = `${phoneNumber}@s.whatsapp.net`;
      
      // Verificar se é tentativa de envio para grupo
      if (this.isGroupMessage(jid)) {
        this.logger.warn(`Attempted to send template message to group ${phoneNumber} - blocked`);
        throw new Error('Sending template messages to groups is not allowed');
      }
      
      // Baileys não suporta templates oficiais, mas podemos simular
      let message = `Template: ${templateName}`;
      if (parameters && parameters.length > 0) {
        message += `\nParâmetros: ${parameters.join(', ')}`;
      }
      
      const result = await this.socket.sendMessage(jid, {
        text: message
      });

      this.logger.log(`Template message sent to ${phoneNumber}: ${result.key.id}`);
      
      return {
        success: true,
        messageId: result.key.id,
        messages: [{
          id: result.key.id,
          status: 'sent'
        }]
      };
    } catch (error) {
      this.logger.error('Error sending template message:', error);
      throw error;
    }
  }

  async sendMediaMessage(phoneNumber: string, mediaType: 'image' | 'audio' | 'video' | 'document', mediaUrl: string, caption?: string): Promise<any> {
    try {
      // Verificar conexão real antes de tentar enviar
      if (!await this.isActuallyConnected()) {
        this.logger.warn('WhatsApp not connected, attempting to reconnect...');
        await this.attemptReconnection();
        
        // Verificar novamente após tentativa de reconexão
        if (!await this.isActuallyConnected()) {
          throw new Error('WhatsApp not connected - reconnection failed');
        }
      }

      const jid = `${phoneNumber}@s.whatsapp.net`;
      
      // Verificar se é tentativa de envio para grupo
      if (this.isGroupMessage(jid)) {
        this.logger.warn(`Attempted to send media message to group ${phoneNumber} - blocked`);
        throw new Error('Sending media messages to groups is not allowed');
      }
      
      let message: any = {};
      
      switch (mediaType) {
        case 'image':
          message = {
            image: { url: mediaUrl },
            caption: caption || ''
          };
          break;
        case 'audio':
          message = {
            audio: { url: mediaUrl }
          };
          break;
        case 'video':
          message = {
            video: { url: mediaUrl },
            caption: caption || ''
          };
          break;
        case 'document':
          message = {
            document: { url: mediaUrl },
            caption: caption || ''
          };
          break;
        default:
          throw new Error(`Unsupported media type: ${mediaType}`);
      }

      const result = await this.socket.sendMessage(jid, message);

      this.logger.log(`Media message sent to ${phoneNumber}: ${result.key.id}`);
      
      return {
        success: true,
        messageId: result.key.id,
        messages: [{
          id: result.key.id,
          status: 'sent'
        }]
      };
    } catch (error) {
      this.logger.error('Error sending media message:', error);
      throw error;
    }
  }

  async getMessageStatus(messageId: string): Promise<any> {
    try {
      // Baileys não tem API direta para status de mensagem
      // Retornar status simulado
      return {
        id: messageId,
        status: 'delivered',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Error getting message status:', error);
      throw error;
    }
  }

  async getProfile(phoneNumber: string): Promise<any> {
    try {
      if (!this.isConnected || !this.socket) {
        throw new Error('WhatsApp not connected');
      }

      const jid = `${phoneNumber}@s.whatsapp.net`;
      const profile = await this.socket.profilePictureUrl(jid, 'image');
      
      return {
        phone: phoneNumber,
        profilePicture: profile,
        name: 'Unknown' // Baileys não fornece nome diretamente
      };
    } catch (error) {
      this.logger.error('Error getting profile:', error);
      throw error;
    }
  }


  isReady(): boolean {
    return this.isConnected && this.socket !== null;
  }

  /**
   * Gera um novo QR code para a sessão
   */
  async generateQRCode(): Promise<string> {
    try {
      this.logger.log('🔄 Generating new QR code...');
      
      if (!this.sessionId) {
        this.logger.error('❌ Session ID is required for QR code generation');
        throw new Error('Session ID is required for QR code generation');
      }

      this.logger.log(`📱 Session ID: ${this.sessionId}`);

      // Se já estiver conectado, desconectar primeiro
      if (this.isConnected && this.socket) {
        this.logger.log('🔌 Disconnecting existing connection...');
        try {
          await this.disconnect();
        } catch (error) {
          this.logger.warn('Error disconnecting before QR generation:', error);
          // Continuar mesmo se houver erro na desconexão
        }
      }

      // Reinicializar para gerar novo QR code
      this.logger.log('🚀 Initializing provider...');
      try {
        await this.initialize();
      } catch (error) {
        this.logger.error('Error initializing provider:', error);
        // Continuar mesmo se houver erro na inicialização
      }
      
      // Aguardar um pouco para o QR code ser gerado (aumentar tempo)
      this.logger.log('⏳ Waiting for QR code generation...');
      await new Promise(resolve => setTimeout(resolve, 10000)); // 10 segundos
      
      // Buscar o QR code mais recente da sessão (com retry)
      let attempts = 0;
      const maxAttempts = 3;
      
      while (attempts < maxAttempts) {
        this.logger.log(`🔍 Looking for QR code in session: ${this.sessionId} (attempt ${attempts + 1}/${maxAttempts})`);
        
        if (this.sessionService) {
          const session = await this.sessionService.findById(this.sessionId);
          if (session?.qrCode) {
            this.logger.log(`✅ QR code found for session ${this.sessionId}, length: ${session.qrCode.length}`);
            return session.qrCode;
          } else {
            this.logger.warn(`⚠️ Session ${this.sessionId} not found or has no QR code (attempt ${attempts + 1})`);
            this.logger.warn(`📊 Session data:`, {
              exists: !!session,
              hasQrCode: !!session?.qrCode,
              status: session?.status
            });
          }
        } else {
          this.logger.warn('⚠️ No session service available');
        }
        
        attempts++;
        if (attempts < maxAttempts) {
          this.logger.log(`⏳ Waiting 5 seconds before retry...`);
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
      
      this.logger.error('❌ QR code not generated after multiple attempts');
      throw new Error('QR code not generated after multiple attempts');
    } catch (error) {
      this.logger.error('❌ Error generating QR code:', error);
      this.logger.error('❌ Error stack:', error.stack);
      
      // Não quebrar a aplicação, apenas retornar erro controlado
      this.logger.warn('⚠️ QR code generation failed, but application continues');
      
      // Limpar recursos para evitar vazamentos
      this.clearConnectionTimeout();
      this.clearReconnectTimeout();
      
      throw error;
    }
  }

  private scheduleReconnect() {
    if (this.isReconnecting || this.reconnectTimeout) {
      this.logger.log('⏳ Reconnection already scheduled or in progress - skipping');
      return; // Already scheduled or in progress
    }

    // VERIFICAR SE JÁ ESTÁ CONECTADO
    if (this.isConnected && this.socket && this.socket.user) {
      this.logger.log('✅ Already connected - skipping reconnection');
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;

    // Backoff exponencial mais conservador: 5, 10, 20, 30, 60 segundos
    const delays = [5000, 10000, 20000, 30000, 60000];
    const delay = delays[Math.min(this.reconnectAttempts - 1, delays.length - 1)];
    
    this.logger.log(`🔄 Scheduling reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay / 1000} seconds...`);
    this.logger.log(`📊 Reconnection strategy: attempt ${this.reconnectAttempts}, delay: ${delay}ms, max attempts: ${this.maxReconnectAttempts}`);
    
    this.reconnectTimeout = setTimeout(async () => {
      try {
        this.logger.log(`🔄 Attempting reconnection (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        
        // Limpar socket atual antes de tentar reconectar (sem logout para evitar crash)
        if (this.socket) {
          this.logger.log('🔌 Clearing socket before reconnect');
          this.socket = null;
        }

        // Resetar estado
        this.isConnected = false;
        
        await this.initialize();
        this.logger.log(`✅ Reconnection attempt ${this.reconnectAttempts} completed successfully`);
      } catch (error) {
        this.logger.error(`❌ Reconnection attempt ${this.reconnectAttempts} failed:`, error);
        
        // Se ainda não atingiu o máximo de tentativas, agendar próxima
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.isReconnecting = false;
          this.scheduleReconnect();
        } else {
          this.logger.error(`Max reconnection attempts (${this.maxReconnectAttempts}) reached. Stopping reconnection.`);
          this.isReconnecting = false;
          if (this.sessionService && this.sessionId) {
            await this.sessionService.updateStatus(this.sessionId, SessionStatus.ERROR);
          }
        }
      } finally {
        this.reconnectTimeout = null;
      }
    }, delay);
  }

  private clearReconnectTimeout() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  private clearConnectionTimeout() {
    if (this.connectionTimeout) {
      this.logger.log(`🧹 Clearing connection timeout`);
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    } else {
      this.logger.log(`🧹 No connection timeout to clear`);
    }
  }

  /**
   * Verifica se já existe uma sessão persistente
   */
  private async checkExistingSession(): Promise<boolean> {
    try {
      if (!this.sessionId) return false;

      const sessionPath = this.config.sessionName || `session-${this.sessionId}`;
      const sessionDir = path.join(process.cwd(), 'sessions', sessionPath);
      
      // Verificar se o diretório existe e tem arquivos de sessão
      if (!fs.existsSync(sessionDir)) {
        this.logger.log(`📁 Session directory does not exist: ${sessionDir}`);
        return false;
      }

      // Verificar se há arquivos de credenciais
      const credsFile = path.join(sessionDir, 'creds.json');
      const hasCreds = fs.existsSync(credsFile);
      
      if (hasCreds) {
        this.logger.log(`🔐 Found existing credentials: ${credsFile}`);
        return true;
      } else {
        this.logger.log(`❌ No credentials found in: ${sessionDir}`);
        return false;
      }
    } catch (error) {
      this.logger.error('Error checking existing session:', error);
      return false;
    }
  }

  private handleConnectionTimeout() {
    // Verificar se já está conectado antes de marcar como falha
    if (this.isConnected && this.socket && this.socket.user) {
      this.logger.log('✅ WhatsApp already connected - ignoring timeout');
      return;
    }

    this.logger.error('Connection timeout - marking session as failed');
    this.isConnected = false;
    this.isReconnecting = false;

    if (this.sessionService && this.sessionId) {
      this.sessionService.updateStatus(this.sessionId, SessionStatus.ERROR).catch(error => {
        this.logger.error('Error updating session status:', error);
      });
    }

    // Limpar socket sem tentar logout (pode estar já fechado)
    if (this.socket) {
      this.logger.log('🔌 Clearing socket reference after timeout');
      this.socket = null;
    }

    // Limpar timeouts
    this.clearConnectionTimeout();
    this.clearReconnectTimeout();
  }

  /**
   * Verifica se a conexão está realmente ativa
   */
  async isActuallyConnected(): Promise<boolean> {
    try {
      // Verificar se o socket existe e tem usuário (conexão ativa)
      if (!this.socket || !this.socket.user) {
        this.logger.log(`🔍 Connection check: socket=${!!this.socket}, user=${!!this.socket?.user}`);
        return false;
      }

      // Verificação adicional: testar se o socket ainda está ativo
      try {
        // Tentar acessar uma propriedade do socket para verificar se ainda está vivo
        const user = this.socket.user;
        if (!user || !user.id) {
          this.logger.log('❌ Socket user invalid');
          return false;
        }
      } catch (error) {
        this.logger.log('❌ Socket appears to be dead:', error.message);
        return false;
      }

      // Se chegou até aqui, está conectado
      this.logger.log(`✅ Connection verified: user=${this.socket.user.id}`);
      return true;
    } catch (error) {
      this.logger.warn('Error checking connection status:', error);
      return false;
    }
  }

  /**
   * Tenta reconectar o WhatsApp
   */
  async attemptReconnection(): Promise<void> {
    try {
      if (this.isReconnecting) {
        this.logger.log('⏳ Reconnection already in progress, skipping...');
        return;
      }

      // VERIFICAR SE JÁ ESTÁ CONECTADO
      if (this.isConnected && this.socket && this.socket.user) {
        this.logger.log('✅ Already connected - skipping reconnection attempt');
        return;
      }

      this.isReconnecting = true;
      this.logger.log('🔄 Attempting to reconnect WhatsApp...');

      // Limpar socket atual
      if (this.socket) {
        try {
          await this.socket.logout();
        } catch (error) {
          this.logger.warn('Error during logout:', error);
        }
        this.socket = null;
      }

      // Resetar estado
      this.isConnected = false;
      this.reconnectAttempts = 0;

      // Tentar inicializar novamente
      await this.initialize();

      this.logger.log('Reconnection attempt completed');
    } catch (error) {
      this.logger.error('Reconnection failed:', error);
      throw error;
    } finally {
      this.isReconnecting = false;
    }
  }

  async disconnect(): Promise<void> {
    try {
      this.logger.log('Disconnecting from WhatsApp...');
      this.clearReconnectTimeout();
      this.clearConnectionTimeout();
      this.isReconnecting = false;
      this.reconnectAttempts = 0;
      
      if (this.socket) {
        try {
          await this.socket.logout();
        } catch (error) {
          this.logger.warn('Error during logout (socket may already be closed):', error);
          // Não re-lançar o erro para não quebrar a aplicação
        }
        this.socket = null;
      }
      
      this.isConnected = false;
      this.logger.log('Disconnected from WhatsApp');
      
      // Atualizar status no banco
      if (this.sessionService && this.sessionId) {
        await this.sessionService.disconnectSession(this.sessionId);
      }
    } catch (error) {
      this.logger.error('Error disconnecting:', error);
      
      // Marcar como erro no banco
      if (this.sessionService && this.sessionId) {
        await this.sessionService.markSessionError(this.sessionId, error.message);
      }
      
      // Não re-lançar o erro para não quebrar a aplicação
      this.logger.warn('Disconnect completed with errors, but application continues');
    }
  }
}



