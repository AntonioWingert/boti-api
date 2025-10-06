import { Injectable } from '@nestjs/common';
import { IWhatsAppProvider, WhatsAppProviderConfig } from '../interfaces/whatsapp-provider.interface';
import { BaileysWhatsAppProvider } from '../providers/baileys-whatsapp.provider';
import { VenomWhatsAppProvider } from '../providers/venom-whatsapp.provider';

export enum WhatsAppProviderType {
  BAILEYS = 'baileys',
  VENOM = 'venom',
  WHATSAPP_BUSINESS = 'whatsapp_business', // API oficial (para futuro)
}

@Injectable()
export class WhatsAppProviderFactory {
  static createProvider(
    type: WhatsAppProviderType,
    config: WhatsAppProviderConfig
  ): IWhatsAppProvider {
    switch (type) {
      case WhatsAppProviderType.BAILEYS:
        return new BaileysWhatsAppProvider(config);
      
      case WhatsAppProviderType.VENOM:
        return new VenomWhatsAppProvider(config);
      
      case WhatsAppProviderType.WHATSAPP_BUSINESS:
        // Implementação futura para API oficial
        throw new Error('WhatsApp Business API not implemented yet');
      
      default:
        throw new Error(`Unsupported WhatsApp provider type: ${type}`);
    }
  }

  static getSupportedProviders(): WhatsAppProviderType[] {
    return [
      WhatsAppProviderType.BAILEYS,
      WhatsAppProviderType.VENOM,
      // WhatsAppProviderType.WHATSAPP_BUSINESS, // Desabilitado por enquanto
    ];
  }

  static getProviderInfo(type: WhatsAppProviderType): {
    name: string;
    description: string;
    package: string;
    documentation: string;
    features: string[];
  } {
    switch (type) {
      case WhatsAppProviderType.BAILEYS:
        return {
          name: 'Baileys',
          description: 'Biblioteca moderna e robusta para WhatsApp Web API',
          package: '@whiskeysockets/baileys',
          documentation: 'https://github.com/WhiskeySockets/Baileys',
          features: [
            'Conexão WebSocket estável',
            'Suporte a mídia',
            'Múltiplas sessões',
            'TypeScript nativo',
            'Atualizações frequentes'
          ]
        };
      
      case WhatsAppProviderType.VENOM:
        return {
          name: 'Venom-Bot',
          description: 'Biblioteca popular e bem documentada para WhatsApp',
          package: 'venom-bot',
          documentation: 'https://github.com/orkestral/venom',
          features: [
            'Fácil de usar',
            'Boa documentação',
            'Suporte a QR Code',
            'Múltiplas instâncias',
            'Comunidade ativa'
          ]
        };
      
      case WhatsAppProviderType.WHATSAPP_BUSINESS:
        return {
          name: 'WhatsApp Business API',
          description: 'API oficial do WhatsApp para negócios',
          package: 'N/A (REST API)',
          documentation: 'https://developers.facebook.com/docs/whatsapp',
          features: [
            'API oficial',
            'Suporte a templates',
            'Webhooks nativos',
            'Métricas avançadas',
            'Compliance total'
          ]
        };
      
      default:
        throw new Error(`Unknown provider type: ${type}`);
    }
  }
}
