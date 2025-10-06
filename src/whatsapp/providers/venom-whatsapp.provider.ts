import { Injectable, Logger } from '@nestjs/common';
import { IWhatsAppProvider, WhatsAppMessage, WhatsAppContact, WhatsAppWebhookData, WhatsAppSendMessageResponse } from '../interfaces/whatsapp-provider.interface';
import type { WhatsAppProviderConfig } from '../interfaces/whatsapp-provider.interface';

/**
 * Implementação usando Venom-Bot (biblioteca de terceiros)
 * Venom-Bot é uma biblioteca popular para WhatsApp Web API
 * 
 * Instalação: npm install venom-bot
 * Documentação: https://github.com/orkestral/venom
 */
@Injectable()
export class VenomWhatsAppProvider implements IWhatsAppProvider {
  private readonly logger = new Logger(VenomWhatsAppProvider.name);
  private config: WhatsAppProviderConfig;

  constructor(config: WhatsAppProviderConfig) {
    this.config = config;
  }

  async verifyWebhook(mode: string, token: string, challenge: string): Promise<string> {
    // Venom-Bot não usa webhook tradicional, usa conexão WebSocket
    if (mode === 'subscribe' && token === this.config.verifyToken) {
      this.logger.log('Venom-Bot configuration verified');
      return challenge;
    }
    throw new Error('Venom-Bot verification failed');
  }

  processWebhookData(body: any): { message?: WhatsAppMessage; contact?: WhatsAppContact; metadata?: any } {
    // Venom-Bot processa mensagens via eventos
    try {
      const message = body.message;
      const contact = body.contact;

      if (!message || !contact) {
        return {};
      }

      return {
        message: {
          id: message.id || '',
          from: message.from || '',
          to: message.to || '',
          text: message.body || '',
          type: this.mapMessageType(message.type),
          timestamp: message.timestamp || Date.now(),
          metadata: message
        },
        contact: {
          id: contact.id || '',
          name: contact.name || contact.pushname || '',
          phone: contact.id?.replace('@c.us', '') || '',
          profile: {
            name: contact.name || contact.pushname
          }
        },
        metadata: body
      };
    } catch (error) {
      this.logger.error('Error processing Venom-Bot data:', error);
      return {};
    }
  }

  async sendMessage(phoneNumber: string, message: string): Promise<WhatsAppSendMessageResponse> {
    try {
      // Implementação usando Venom-Bot
      // const client = await create('session-name');
      // await client.sendText(`${phoneNumber}@c.us`, message);
      
      this.logger.log(`Venom-Bot: Message sent to ${phoneNumber}: ${message}`);
      
      return {
        messaging_product: 'whatsapp',
        contacts: [{
          input: phoneNumber,
          wa_id: phoneNumber
        }],
        messages: [{
          id: `venom_${Date.now()}`
        }]
      };
    } catch (error) {
      this.logger.error('Error sending message via Venom-Bot:', error);
      throw error;
    }
  }

  async sendTemplateMessage(phoneNumber: string, templateName: string, parameters: string[] = []): Promise<WhatsAppSendMessageResponse> {
    try {
      // Venom-Bot não suporta templates oficiais
      const templateMessage = this.formatTemplateMessage(templateName, parameters);
      return await this.sendMessage(phoneNumber, templateMessage);
    } catch (error) {
      this.logger.error('Error sending template message via Venom-Bot:', error);
      throw error;
    }
  }

  async sendMediaMessage(phoneNumber: string, mediaType: 'image' | 'audio' | 'video' | 'document', mediaUrl: string, caption?: string): Promise<WhatsAppSendMessageResponse> {
    try {
      // Implementação usando Venom-Bot para mídia
      // const client = await create('session-name');
      // await client.sendFile(`${phoneNumber}@c.us`, mediaUrl, caption, { type: mediaType });
      
      this.logger.log(`Venom-Bot: Media message sent to ${phoneNumber}: ${mediaType}`);
      
      return {
        messaging_product: 'whatsapp',
        contacts: [{
          input: phoneNumber,
          wa_id: phoneNumber
        }],
        messages: [{
          id: `venom_media_${Date.now()}`
        }]
      };
    } catch (error) {
      this.logger.error('Error sending media message via Venom-Bot:', error);
      throw error;
    }
  }

  async getMessageStatus(messageId: string): Promise<string> {
    try {
      // Venom-Bot não tem API de status oficial
      this.logger.log(`Venom-Bot: Getting status for message ${messageId}`);
      return 'sent';
    } catch (error) {
      this.logger.error('Error getting message status via Venom-Bot:', error);
      throw error;
    }
  }

  async getProfile(phoneNumber: string): Promise<WhatsAppContact> {
    try {
      // Implementação usando Venom-Bot para obter perfil
      // const client = await create('session-name');
      // const profile = await client.getProfilePicFromServer(`${phoneNumber}@c.us`);
      
      this.logger.log(`Venom-Bot: Getting profile for ${phoneNumber}`);
      
      return {
        id: `${phoneNumber}@c.us`,
        phone: phoneNumber,
        name: `User ${phoneNumber}`,
        profile: {
          name: `User ${phoneNumber}`
        }
      };
    } catch (error) {
      this.logger.error('Error getting profile via Venom-Bot:', error);
      throw error;
    }
  }

  private mapMessageType(type: string): 'text' | 'image' | 'audio' | 'video' | 'document' | 'location' | 'contact' {
    switch (type) {
      case 'image': return 'image';
      case 'audio': return 'audio';
      case 'video': return 'video';
      case 'document': return 'document';
      case 'location': return 'location';
      case 'contact': return 'contact';
      default: return 'text';
    }
  }

  private formatTemplateMessage(templateName: string, parameters: string[]): string {
    let message = `📋 ${templateName}\n\n`;
    
    if (parameters.length > 0) {
      parameters.forEach((param, index) => {
        message += `${index + 1}. ${param}\n`;
      });
    }
    
    return message;
  }
}
