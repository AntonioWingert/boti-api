import { Injectable, Logger } from '@nestjs/common';
import type { IWhatsAppProvider } from '../whatsapp/interfaces/whatsapp-provider.interface';

export interface ChatbotResponse {
  text?: string;
  type: 'text' | 'interactive' | 'template' | 'media';
  options?: Array<{
    id: string;
    text: string;
  }>;
  template?: {
    name: string;
    language: {
      code: string;
    };
    components: Array<{
      type: string;
      parameters?: Array<{
        type: string;
        text?: string;
        payload?: string;
      }>;
      sub_type?: string;
      index?: string;
    }>;
  };
  buttons?: Array<{
    id: string;
    text: string;
    payload: string;
  }>;
  mediaUrl?: string;
  mediaType?: 'image' | 'audio' | 'video' | 'document';
  caption?: string;
}

@Injectable()
export class WhatsappResponseService {
  private readonly logger = new Logger(WhatsappResponseService.name);
  private whatsappProvider: IWhatsAppProvider;

  setWhatsAppProvider(provider: IWhatsAppProvider) {
    this.whatsappProvider = provider;
  }

  /**
   * Verifica se o provider está configurado
   */
  isProviderConfigured(): boolean {
    return !!this.whatsappProvider;
  }

  /**
   * Envia resposta do chatbot via WhatsApp
   * @param phoneNumber Número do telefone
   * @param response Resposta do chatbot
   */
  async sendResponse(phoneNumber: string, response: ChatbotResponse) {
    try {
      if (!this.isProviderConfigured()) {
        throw new Error('WhatsApp provider not configured. Please initialize the provider first.');
      }
      
      switch (response.type) {
        case 'text':
          return await this.sendTextMessage(phoneNumber, response.text!);

        case 'interactive':
          return await this.sendInteractiveMessage(phoneNumber, response);

        case 'template':
          return await this.sendTemplateMessage(phoneNumber, response);

        case 'media':
          return await this.sendMediaMessage(phoneNumber, response);

        default:
          return await this.sendTextMessage(phoneNumber, response.text || 'Mensagem não reconhecida');
      }
    } catch (error) {
      this.logger.error('Error sending WhatsApp response:', error);
      throw error;
    }
  }

  /**
   * Envia mensagem de texto simples
   */
  private async sendTextMessage(phoneNumber: string, text: string) {
    return await this.whatsappProvider.sendMessage(phoneNumber, text);
  }

  /**
   * Envia mensagem interativa com botões
   */
  private async sendInteractiveMessage(phoneNumber: string, response: ChatbotResponse) {
    // Usar botões interativos do Baileys (buttons message - compatível com versões estáveis)
    if (response.buttons && response.buttons.length > 0) {
      this.logger.log(`📱 Sending interactive message with buttons to ${phoneNumber}:`, {
        text: response.text,
        buttonsCount: response.buttons.length,
        buttons: response.buttons.map(b => ({ id: b.id, text: b.text, payload: b.payload }))
      });

      const buttons = response.buttons.map((button) => ({
        buttonId: button.payload || button.id,
        buttonText: { displayText: button.text },
        type: 1
      }));

      const messagePayload = {
        text: response.text || 'Escolha uma opção:',
        buttons,
        headerType: 1
      } as any;

      return await this.whatsappProvider.sendMessage(phoneNumber, messagePayload);
    }

    // Fallback para texto simples se não houver botões
    let message = response.text || '';
    
    if (response.options && response.options.length > 0) {
      message += '\n\n*Opções:*\n';
      response.options.forEach((option, index) => {
        message += `${index + 1}. ${option.text}\n`;
      });
    }

    return await this.whatsappProvider.sendMessage(phoneNumber, message);
  }

  /**
   * Envia mensagem com template (botões interativos)
   */
  private async sendTemplateMessage(phoneNumber: string, response: ChatbotResponse) {
    if (!response.template) {
      throw new Error('Template is required for template messages');
    }

    // Para Baileys, vamos usar botões interativos reais
    if (response.buttons && response.buttons.length > 0) {
      // Usar sendInteractiveMessage para botões reais
      return await this.sendInteractiveMessage(phoneNumber, response);
    }

    // Fallback para texto simples se não houver botões
    const message = response.text || '';
    this.logger.log(`📱 Sending template message (text only) to ${phoneNumber}:`, {
      text: message
    });

    return await this.whatsappProvider.sendMessage(phoneNumber, message);
  }

  /**
   * Envia mensagem com mídia
   */
  private async sendMediaMessage(phoneNumber: string, response: ChatbotResponse) {
    if (!response.mediaUrl || !response.mediaType) {
      throw new Error('Media URL and type are required for media messages');
    }

    return await this.whatsappProvider.sendMediaMessage(
      phoneNumber,
      response.mediaType,
      response.mediaUrl,
      response.caption
    );
  }

  /**
   * Envia mensagem de boas-vindas
   */
  async sendWelcomeMessage(phoneNumber: string, companyName: string) {
    const message = `🎉 *Bem-vindo à ${companyName}!*\n\nComo posso ajudar você hoje?`;
    
    return await this.sendTextMessage(phoneNumber, message);
  }

  /**
   * Envia mensagem de despedida
   */
  async sendGoodbyeMessage(phoneNumber: string) {
    const message = `👋 *Obrigado por entrar em contato!*\n\nSua conversa foi encerrada. Se precisar de mais ajuda, é só chamar!`;
    
    return await this.sendTextMessage(phoneNumber, message);
  }

  /**
   * Envia mensagem de escalação
   */
  async sendEscalationMessage(phoneNumber: string, agentName?: string) {
    const message = agentName 
      ? `🔄 *Transferindo para ${agentName}...*\n\nAguarde um momento, você será atendido por um de nossos especialistas.`
      : `🔄 *Transferindo para atendimento humano...*\n\nAguarde um momento, você será atendido por um de nossos especialistas.`;
    
    return await this.sendTextMessage(phoneNumber, message);
  }

  /**
   * Envia mensagem de erro
   */
  async sendErrorMessage(phoneNumber: string) {
    const message = `❌ *Ops! Algo deu errado.*\n\nTente novamente em alguns instantes ou entre em contato conosco.`;
    
    return await this.sendTextMessage(phoneNumber, message);
  }

  /**
   * Envia mensagem de confirmação
   */
  async sendConfirmationMessage(phoneNumber: string, action: string) {
    const message = `✅ *${action} confirmado!*\n\nObrigado pela confirmação.`;
    
    return await this.sendTextMessage(phoneNumber, message);
  }
}
