# 📡 API Reference

## 🔐 Autenticação

Todos os endpoints (exceto webhooks) requerem autenticação JWT.

### Headers Necessários
```http
Authorization: Bearer <jwt-token>
Content-Type: application/json
```

## 👤 Usuários

### Registrar Usuário
```http
POST /users/register
```

**Body:**
```json
{
  "name": "João Silva",
  "email": "joao@empresa.com",
  "password": "senha123",
  "role": "AGENT",
  "companyId": "company-id"
}
```

### Login
```http
POST /users/login
```

**Body:**
```json
{
  "email": "joao@empresa.com",
  "password": "senha123"
}
```

### Perfil do Usuário
```http
GET /users/profile
```

## 🏢 Empresas

### Listar Empresas
```http
GET /companies
```

### Criar Empresa
```http
POST /companies
```

**Body:**
```json
{
  "name": "Minha Empresa",
  "email": "contato@empresa.com",
  "phone": "11999999999",
  "address": "Rua das Flores, 123"
}
```

### Obter Empresa por ID
```http
GET /companies/:id
```

### Atualizar Empresa
```http
PATCH /companies/:id
```

### Deletar Empresa
```http
DELETE /companies/:id
```

### Toggle Status da Empresa
```http
PATCH /companies/:id/toggle-status
```

## 👥 Clientes

### Listar Clientes
```http
GET /clients?companyId=xxx
```

### Criar Cliente
```http
POST /clients
```

**Body:**
```json
{
  "name": "Maria Santos",
  "phone": "11988888888",
  "email": "maria@email.com",
  "companyId": "company-id"
}
```

### Obter Cliente por ID
```http
GET /clients/:id
```

### Obter Cliente por Telefone
```http
GET /clients/phone/:phone
```

### Atualizar Cliente
```http
PATCH /clients/:id
```

### Deletar Cliente
```http
DELETE /clients/:id
```

### Toggle Status do Cliente
```http
PATCH /clients/:id/toggle-status
```

## 🤖 Chatbots

### Listar Chatbots
```http
GET /chatbots?companyId=xxx
```

### Criar Chatbot
```http
POST /chatbots
```

**Body:**
```json
{
  "name": "Chatbot Vendas",
  "description": "Atendimento de vendas",
  "companyId": "company-id",
  "configuracao": {
    "respostaPadrao": "Olá! Como posso ajudar?",
    "respostas": {
      "oi": "Olá! Seja bem-vindo!",
      "ajuda": "Posso ajudá-lo com informações sobre nossos produtos."
    },
    "escalarParaAtendente": ["atendente", "falar com pessoa"]
  }
}
```

### Obter Chatbot por ID
```http
GET /chatbots/:id
```

### Obter Chatbot Ativo da Empresa
```http
GET /chatbots/company/:companyId/active
```

### Atualizar Chatbot
```http
PATCH /chatbots/:id
```

### Deletar Chatbot
```http
DELETE /chatbots/:id
```

### Toggle Status do Chatbot
```http
PATCH /chatbots/:id/toggle-status
```

## 💬 Conversas e Mensagens

### Criar Conversa
```http
POST /messages/conversations
```

**Body:**
```json
{
  "clientId": "client-id",
  "companyId": "company-id",
  "chatbotId": "chatbot-id"
}
```

### Listar Conversas
```http
GET /messages/conversations?companyId=xxx&status=ACTIVE
```

### Obter Conversa por ID
```http
GET /messages/conversations/:id
```

### Criar Mensagem
```http
POST /messages
```

**Body:**
```json
{
  "conversationId": "conversation-id",
  "content": "Olá! Como posso ajudar?",
  "sender": "SYSTEM"
}
```

### Listar Mensagens da Conversa
```http
GET /messages/conversations/:conversationId/messages
```

### Atualizar Status da Conversa
```http
PATCH /messages/conversations/:id/status
```

**Body:**
```json
{
  "status": "ACTIVE"
}
```

### Escalar Conversa
```http
PATCH /messages/conversations/:id/escalate
```

**Body:**
```json
{
  "reason": "Cliente solicitou atendimento humano"
}
```

### Atribuir Conversa
```http
PATCH /messages/conversations/:id/assign
```

**Body:**
```json
{
  "userId": "user-id"
}
```

## 📱 WhatsApp

### Verificar Webhook
```http
GET /whatsapp/webhook?hub.mode=subscribe&hub.verify_token=xxx&hub.challenge=xxx
```

### Receber Mensagens
```http
POST /whatsapp/webhook
```

### Enviar Mensagem
```http
POST /whatsapp/send-message
```

**Body:**
```json
{
  "phoneNumber": "5511999999999",
  "message": "Olá! Como posso ajudar?"
}
```

### Enviar Template
```http
POST /whatsapp/send-template
```

**Body:**
```json
{
  "phoneNumber": "5511999999999",
  "templateName": "welcome_template",
  "parameters": ["João", "12345"]
}
```

### Verificar Status da Conexão
```http
GET /whatsapp/status
```

### Sincronizar Sessão Atual
```http
POST /whatsapp/sync-status
```

### Sincronizar Todas as Sessões
```http
POST /whatsapp/sync-all-sessions
```

### Forçar Sincronização Completa
```http
POST /whatsapp/force-sync
```

### Forçar Sincronização da Sessão Atual
```http
POST /whatsapp/force-sync-current
```

### Limpar Sessões Antigas
```http
POST /whatsapp/cleanup-sessions
```

### Verificar Conversas Inativas
```http
POST /whatsapp/check-inactive-conversations
```

## 📊 Status e Códigos de Resposta

### Status de Conversas
- `ACTIVE` - Conversa ativa
- `PAUSED` - Conversa pausada
- `FINISHED` - Conversa finalizada
- `ESCALATED` - Conversa escalada

### Prioridades
- `LOW` - Baixa prioridade
- `NORMAL` - Prioridade normal
- `HIGH` - Alta prioridade
- `URGENT` - Prioridade urgente

### Status de Sessões WhatsApp
- `DISCONNECTED` - Desconectado
- `CONNECTING` - Conectando
- `CONNECTED` - Conectado
- `QR_CODE` - Aguardando QR Code
- `ERROR` - Erro

### Códigos de Resposta HTTP
- `200` - Sucesso
- `201` - Criado com sucesso
- `400` - Bad Request
- `401` - Não autorizado
- `403` - Proibido
- `404` - Não encontrado
- `500` - Erro interno do servidor

## 🔍 Exemplos de Uso

### Fluxo Completo de Atendimento

1. **Cliente envia mensagem via WhatsApp**
2. **Sistema cria/atualiza conversa**
3. **Chatbot processa e responde**
4. **Se necessário, conversa é escalada**
5. **Agente assume e responde**

### Exemplo de Integração

```javascript
// Verificar status da conexão
const status = await fetch('http://localhost:3000/whatsapp/status', {
  headers: { 'Authorization': 'Bearer ' + token }
});

// Enviar mensagem
const response = await fetch('http://localhost:3000/whatsapp/send-message', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token
  },
  body: JSON.stringify({
    phoneNumber: '5511999999999',
    message: 'Olá! Como posso ajudar?'
  })
});
```
