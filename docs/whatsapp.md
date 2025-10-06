# 📱 Configuração do WhatsApp

## 🏆 **Recomendação: Baileys (@whiskeysockets/baileys)**

### ✅ **Por que Baileys?**

- **Estabilidade**: Atualizações frequentes e confiáveis
- **Performance**: Conexão WebSocket nativa e eficiente
- **TypeScript**: Suporte nativo, perfeito para NestJS
- **Recursos**: Suporte completo a mídia e funcionalidades avançadas
- **Comunidade**: Ativa e responsiva
- **Custo**: 100% gratuito

## 🚀 **Instalação**

### 1. Instalar Dependências

```bash
# Baileys (Recomendado)
npm install @whiskeysockets/baileys

# Dependências adicionais para Baileys
npm install qrcode-terminal pino @hapi/boom
```

### 2. Configuração do Ambiente

```env
# .env
WHATSAPP_PROVIDER=baileys
WHATSAPP_SESSION_NAME=chatbot-session
WHATSAPP_QR_CODE=true
WHATSAPP_HEADLESS=true

# Baileys específico
BAILEYS_SESSION_PATH=./sessions
BAILEYS_QR_CODE_TIMEOUT=60000
BAILEYS_CONNECTION_TIMEOUT=30000
BAILEYS_RETRY_REQUEST_DELAY=1000
```

## 🔧 **Implementação Baileys**

### 1. Estrutura de Arquivos

```
src/whatsapp/
├── interfaces/
│   └── whatsapp-provider.interface.ts
├── providers/
│   ├── baileys-whatsapp.provider.ts
│   └── venom-whatsapp.provider.ts
├── factories/
│   └── whatsapp-provider.factory.ts
└── whatsapp.service.ts
```

### 2. Exemplo de Uso

```typescript
// Configuração automática via .env
const whatsappService = new WhatsappService(
  configService,
  prismaService,
  messagesService,
  clientsService,
  chatbotsService
);

// Enviar mensagem
await whatsappService.sendMessage('5511999999999', 'Olá! Como posso ajudar?');

// Enviar mídia
await whatsappService.sendMediaMessage(
  '5511999999999', 
  'image', 
  'https://example.com/image.jpg',
  'Veja esta imagem!'
);
```

## 📊 **Comparação de APIs**

| Característica | Baileys | Venom-Bot | WhatsApp Business API |
|----------------|---------|-----------|---------------------|
| **Custo** | Gratuito | Gratuito | Pago |
| **Estabilidade** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Performance** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Facilidade** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| **Recursos** | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **TypeScript** | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| **Comunidade** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |

## 🎯 **Vantagens para seu Projeto**

### **1. Chatbot de Fluxo de Decisão**
- ✅ Suporte a botões e listas interativas
- ✅ Processamento de respostas rápidas
- ✅ Navegação fluida entre nós

### **2. Multi-tenant**
- ✅ Múltiplas sessões por empresa
- ✅ Isolamento de dados
- ✅ Escalabilidade horizontal

### **3. Integração com NestJS**
- ✅ Injeção de dependência
- ✅ TypeScript nativo
- ✅ Decorators e guards

## 🔄 **Alternativas Consideradas**

### **Venom-Bot** (Segunda opção)
- ✅ Mais fácil de usar
- ✅ Documentação excelente
- ❌ Menos estável
- ❌ Atualizações mais lentas

### **WhatsApp Business API** (Futuro)
- ✅ API oficial
- ✅ Suporte a templates
- ❌ Muito caro
- ❌ Complexo de configurar

### **Evolution API** (Serviço pago)
- ✅ Interface web
- ✅ Múltiplas instâncias
- ❌ Custo mensal
- ❌ Dependência externa

## 🚀 **Próximos Passos**

1. **Instalar Baileys**: `npm install @whiskeysockets/baileys`
2. **Configurar .env**: Usar configurações fornecidas
3. **Testar conexão**: Executar `./scripts.sh dev`
4. **Escanear QR Code**: Conectar WhatsApp
5. **Implementar fluxos**: Usar sistema de chatbot criado

## 📚 **Recursos Úteis**

- [Documentação Baileys](https://github.com/WhiskeySockets/Baileys)
- [Exemplos de Código](https://github.com/WhiskeySockets/Baileys/tree/master/Example)
- [Comunidade Discord](https://discord.gg/9K2BvbXHT4)
- [Troubleshooting](https://github.com/WhiskeySockets/Baileys#troubleshooting)

---

**Recomendação Final**: Use **Baileys** para máxima estabilidade, performance e integração com seu projeto NestJS! 🎉
