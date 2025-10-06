# 🤖 Chatbot API - Sistema Completo de WhatsApp

Sistema de chatbot completo com integração ao WhatsApp, escalamento de conversas, configuração por empresa e sincronização automática de status.

## 🚀 Funcionalidades Principais

- **📱 Integração WhatsApp**: Recebimento e envio de mensagens via WhatsApp (Baileys)
- **🔄 Sincronização Automática**: Status das sessões sincronizado automaticamente
- **🏢 Multi-tenant**: Suporte a múltiplas empresas com clientes independentes
- **🤖 Chatbot Configurável**: Cada empresa pode ter seu próprio chatbot
- **👥 Sistema de Escalamento**: Conversas podem ser escaladas para agentes humanos
- **🔐 Autenticação JWT**: Sistema seguro de autenticação
- **📊 Histórico Completo**: Armazenamento de conversas e mensagens
- **⏰ Tarefas Agendadas**: Limpeza automática e sincronização periódica

## 🛠️ Tecnologias

- **NestJS** - Framework Node.js
- **Prisma** - ORM para banco de dados
- **MySQL** - Banco de dados
- **Docker** - Containerização
- **Baileys** - Biblioteca WhatsApp
- **TypeScript** - Linguagem de programação

## 🐳 Instalação e Execução

### Opção 1: Docker (Recomendado)

```bash
# Clonar repositório
git clone <repository-url>
cd chatbot-api

# Iniciar ambiente completo
./scripts.sh dev

# Ou usar comandos individuais
docker-compose up -d
```

### Opção 2: Desenvolvimento Local

```bash
# Instalar dependências
npm install

# Configurar banco de dados
cp .env.example .env
# Editar .env com suas configurações

# Executar migrações
npm run prisma:push

# Iniciar aplicação
npm run start:dev
```

## 📋 Scripts Disponíveis

### Docker
```bash
./scripts.sh dev          # Ambiente de desenvolvimento com logs
./scripts.sh up           # Iniciar containers
./scripts.sh down         # Parar containers
./scripts.sh build        # Reconstruir imagens
./scripts.sh logs         # Ver logs da aplicação
./scripts.sh shell        # Abrir shell no container
./scripts.sh clean        # Limpar tudo
```

### NPM
```bash
npm run start:dev         # Desenvolvimento
npm run build            # Compilar
npm run start:prod       # Produção
npm run prisma:push      # Aplicar migrações
npm run db:seed          # Popular banco
```

## 🔧 Configuração

### Variáveis de Ambiente

```env
# Database
DATABASE_URL="mysql://root:password@localhost:3306/chatbot_api"

# JWT
JWT_SECRET="your-super-secret-jwt-key-here"
JWT_EXPIRES_IN="24h"

# WhatsApp (Baileys)
WHATSAPP_PROVIDER="baileys"
WHATSAPP_SESSION_NAME="chatbot-session"
WHATSAPP_QR_CODE="true"
WHATSAPP_HEADLESS="true"

# App
PORT=3000
NODE_ENV="development"
```

### Configuração do WhatsApp

O sistema usa **Baileys** como biblioteca principal do WhatsApp:

1. **Instalação automática**: As dependências são instaladas automaticamente
2. **QR Code**: Aparece no terminal para conectar o WhatsApp
3. **Sessões**: Armazenadas em `./sessions/`
4. **Sincronização**: Status sincronizado automaticamente a cada 5 minutos

## 📊 Estrutura do Banco de Dados

### Entidades Principais

- **Company**: Empresas que usam o sistema
- **User**: Usuários das empresas (agentes, supervisores, admins)
- **Client**: Clientes que interagem via WhatsApp
- **Chatbot**: Configurações de chatbot por empresa
- **Conversation**: Conversas entre clientes e sistema/agentes
- **Message**: Mensagens individuais nas conversas
- **WhatsAppSession**: Sessões do WhatsApp por empresa

### Relacionamentos

- Uma empresa pode ter múltiplos usuários, clientes, chatbots e sessões
- Um cliente pertence a uma empresa
- Uma conversa pertence a uma empresa, cliente e opcionalmente um chatbot/usuário
- Uma mensagem pertence a uma conversa
- Uma sessão WhatsApp pertence a uma empresa

## 🔄 Sincronização Automática

### Tarefas Agendadas

- **A cada 5 minutos**: Sincroniza status de todas as sessões ativas
- **Diariamente às 2:00 AM**: Limpa sessões antigas (30+ dias)
- **A cada hora**: Verifica e encerra conversas inativas

### Endpoints de Sincronização

```http
GET /whatsapp/status                    # Verificar status da conexão
POST /whatsapp/sync-status             # Sincronizar sessão atual
POST /whatsapp/sync-all-sessions       # Sincronizar todas as sessões
POST /whatsapp/force-sync              # Forçar sincronização completa
POST /whatsapp/cleanup-sessions        # Limpar sessões antigas
POST /whatsapp/check-inactive-conversations # Verificar conversas inativas
```

## 📡 API Endpoints

### Autenticação
- `POST /users/register` - Registrar usuário
- `POST /users/login` - Login
- `GET /users/profile` - Perfil do usuário

### Empresas
- `GET /companies` - Listar empresas
- `POST /companies` - Criar empresa
- `GET /companies/:id` - Obter empresa por ID
- `PATCH /companies/:id` - Atualizar empresa
- `DELETE /companies/:id` - Deletar empresa

### Clientes
- `GET /clients` - Listar clientes
- `POST /clients` - Criar cliente
- `GET /clients/:id` - Obter cliente por ID
- `GET /clients/phone/:phone` - Obter cliente por telefone
- `PATCH /clients/:id` - Atualizar cliente
- `DELETE /clients/:id` - Deletar cliente

### Chatbots
- `GET /chatbots` - Listar chatbots
- `POST /chatbots` - Criar chatbot
- `GET /chatbots/:id` - Obter chatbot por ID
- `PATCH /chatbots/:id` - Atualizar chatbot
- `DELETE /chatbots/:id` - Deletar chatbot

### Conversas e Mensagens
- `POST /messages/conversations` - Criar conversa
- `GET /messages/conversations` - Listar conversas
- `GET /messages/conversations/:id` - Obter conversa por ID
- `POST /messages` - Criar mensagem
- `GET /messages/conversations/:conversationId/messages` - Listar mensagens da conversa
- `PATCH /messages/conversations/:id/status` - Atualizar status da conversa
- `PATCH /messages/conversations/:id/escalate` - Escalar conversa
- `PATCH /messages/conversations/:id/assign` - Atribuir conversa a usuário

### WhatsApp
- `GET /whatsapp/webhook` - Verificar webhook
- `POST /whatsapp/webhook` - Receber mensagens
- `POST /whatsapp/send-message` - Enviar mensagem
- `POST /whatsapp/send-template` - Enviar template

## 🤖 Configuração do Chatbot

O chatbot é configurado através do campo `configuracao` (JSON) na entidade Chatbot:

```json
{
  "respostaPadrao": "Olá! Como posso ajudá-lo?",
  "respostas": {
    "oi": "Olá! Seja bem-vindo!",
    "ajuda": "Posso ajudá-lo com informações sobre nossos produtos e serviços.",
    "contato": "Para falar com um atendente, digite 'atendente'"
  },
  "escalarParaAtendente": ["atendente", "falar com pessoa", "humano"]
}
```

## 📊 Status e Prioridades

### Status de Conversas
- **ATIVA**: Conversa em andamento
- **PAUSADA**: Conversa pausada temporariamente
- **FINALIZADA**: Conversa encerrada
- **ESCALADA**: Conversa escalada para atendimento humano

### Prioridades
- **BAIXA**: Conversas de baixa prioridade
- **NORMAL**: Prioridade padrão
- **ALTA**: Conversas importantes
- **URGENTE**: Conversas críticas

## 🔍 Troubleshooting

### Problemas de Conexão WhatsApp

1. **Verificar status da sessão**:
   ```bash
   curl -X GET "http://localhost:3000/whatsapp/status"
   ```

2. **Forçar sincronização**:
   ```bash
   curl -X POST "http://localhost:3000/whatsapp/sync-status"
   ```

3. **Ver logs da aplicação**:
   ```bash
   ./scripts.sh logs
   ```

### Problemas de Container

1. **Reconstruir container**:
   ```bash
   ./scripts.sh build
   ```

2. **Limpar tudo e recomeçar**:
   ```bash
   ./scripts.sh clean
   ./scripts.sh dev
   ```

## 📚 Documentação Adicional

- [Configuração do Docker](docs/docker.md)
- [Configuração do WhatsApp](docs/whatsapp.md)
- [Sincronização de Status](docs/sync.md)
- [API Reference](docs/api.md)

## 🚀 Próximos Passos

1. ✅ Configurar banco de dados MySQL
2. ✅ Configurar WhatsApp com Baileys
3. ✅ Implementar sincronização automática
4. 🔄 Testar endpoints da API
5. 📋 Implementar interface web para agentes
6. 📊 Adicionar relatórios e métricas
7. 🔔 Implementar notificações em tempo real (WebSocket)

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

---

**Desenvolvido com ❤️ para facilitar a comunicação via WhatsApp**# boti-api
