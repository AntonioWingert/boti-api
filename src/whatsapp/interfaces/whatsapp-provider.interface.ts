export interface WhatsAppMessage {
  id: string;
  from: string;
  to: string;
  text?: string;
  type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'location' | 'contact';
  timestamp: number;
  metadata?: any;
}

export interface WhatsAppContact {
  id: string;
  name?: string;
  phone: string;
  profile?: {
    name?: string;
  };
}

export interface WhatsAppWebhookData {
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts?: WhatsAppContact[];
        messages?: WhatsAppMessage[];
        statuses?: Array<{
          id: string;
          status: 'sent' | 'delivered' | 'read' | 'failed';
          timestamp: string;
          recipient_id: string;
        }>;
      };
      field: string;
    }>;
  }>;
}

export interface WhatsAppSendMessageResponse {
  messaging_product: string;
  contacts: Array<{
    input: string;
    wa_id: string;
  }>;
  messages: Array<{
    id: string;
  }>;
}

export interface WhatsAppProviderConfig {
  apiUrl?: string;
  accessToken?: string;
  phoneNumberId?: string;
  verifyToken?: string;
  // Configurações específicas da biblioteca de terceiros
  [key: string]: any;
}

export interface IWhatsAppProvider {
  /**
   * Inicializa o provider (opcional)
   */
  initialize?(): Promise<void>;

  /**
   * Define o ID da sessão (opcional)
   */
  setSessionId?(sessionId: string): void;

  /**
   * Define o serviço de sessão (opcional)
   */
  setSessionService?(service: any): void;

  /**
   * Define callback para processar mensagens (opcional)
   */
  setMessageCallback?(callback: (message: any, contact: any) => Promise<void>): void;

  /**
   * Define o serviço de eventos (opcional)
   */
  setEventsService?(service: any): void;

  /**
   * Verifica o webhook do WhatsApp
   */
  verifyWebhook(mode: string, token: string, challenge: string): Promise<string>;

  /**
   * Processa dados do webhook
   */
  processWebhookData(body: any): {
    message?: WhatsAppMessage;
    contact?: WhatsAppContact;
    metadata?: any;
  };

  /**
   * Envia mensagem de texto
   */
  sendMessage(phoneNumber: string, message: string): Promise<WhatsAppSendMessageResponse>;

  /**
   * Envia mensagem de template
   */
  sendTemplateMessage(
    phoneNumber: string, 
    templateName: string, 
    parameters?: string[]
  ): Promise<WhatsAppSendMessageResponse>;

  /**
   * Envia mensagem de mídia
   */
  sendMediaMessage(
    phoneNumber: string, 
    mediaType: 'image' | 'audio' | 'video' | 'document',
    mediaUrl: string,
    caption?: string
  ): Promise<WhatsAppSendMessageResponse>;

  /**
   * Verifica status da mensagem
   */
  getMessageStatus(messageId: string): Promise<string>;

  /**
   * Obtém informações do perfil do usuário
   */
  getProfile(phoneNumber: string): Promise<WhatsAppContact>;

  /**
   * Desconecta o provider (opcional)
   */
  disconnect?(): Promise<void>;

  /**
   * Verifica se o provider está pronto (opcional)
   */
  isReady?(): boolean;

  /**
   * Gera um novo QR code para a sessão (opcional)
   */
  generateQRCode?(): Promise<string>;

  /**
   * Verifica se está realmente conectado (opcional)
   */
  isActuallyConnected?(): Promise<boolean>;
}
