# 🔄 Sincronização de Status do WhatsApp

## Problema Resolvido

Anteriormente, o status da sessão do WhatsApp no banco de dados poderia ficar desatualizado se:
- A conexão caísse silenciosamente
- Houvesse problemas de rede
- O processo fosse reiniciado sem atualizar o status

## Solução Implementada

### 1. Verificação Automática de Status

O sistema agora verifica automaticamente se a sessão está realmente conectada e sincroniza com o banco de dados.

### 2. Sincronização Automática e Manual

- **A cada 5 minutos**: Verifica e sincroniza o status de todas as sessões ativas
- **Diariamente às 2:00 AM**: Limpa sessões antigas (mais de 30 dias)
- **A cada hora**: Verifica e encerra conversas inativas
- **Endpoints disponíveis** para executar tarefas manualmente quando necessário

### 3. Endpoints de Sincronização Manual

#### Verificar Status da Conexão
```http
GET /whatsapp/status
Authorization: Bearer <token>
```

Resposta:
```json
{
  "connected": true,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### Sincronizar Sessão Atual
```http
POST /whatsapp/sync-status
Authorization: Bearer <token>
```

#### Sincronizar Todas as Sessões
```http
POST /whatsapp/sync-all-sessions
Authorization: Bearer <token>
```

#### Forçar Sincronização Completa
```http
POST /whatsapp/force-sync
Authorization: Bearer <token>
```

#### Forçar Sincronização da Sessão Atual
```http
POST /whatsapp/force-sync-current
Authorization: Bearer <token>
```

#### Limpar Sessões Antigas
```http
POST /whatsapp/cleanup-sessions
Authorization: Bearer <token>
```

#### Verificar Conversas Inativas
```http
POST /whatsapp/check-inactive-conversations
Authorization: Bearer <token>
```

## Como Usar

### 1. Verificação Manual

Para verificar se a sessão está realmente conectada:

```bash
curl -X GET "http://localhost:3000/whatsapp/status" \
  -H "Authorization: Bearer SEU_TOKEN"
```

### 2. Sincronização Manual

Se você suspeitar que o status no banco está incorreto:

```bash
curl -X POST "http://localhost:3000/whatsapp/sync-status" \
  -H "Authorization: Bearer SEU_TOKEN"
```

### 3. Usando Scripts

```bash
# Verificar status
./scripts.sh whatsapp-status

# Sincronizar sessões
./scripts.sh whatsapp-sync

# Limpar sessões antigas
./scripts.sh whatsapp-cleanup
```

### 4. Monitoramento

O sistema agora registra logs detalhados sobre:
- Status real vs status no banco
- Sincronizações realizadas
- Erros de conexão
- Sessões limpas automaticamente

## Logs de Exemplo

```
[WhatsappSyncService] Starting scheduled session status sync...
[WhatsappService] Session status synced: CONNECTED
[WhatsappSessionService] Syncing session abc123: marking as CONNECTED (was DISCONNECTED)
[WhatsappSyncService] Scheduled session status sync completed
```

## Configuração

As tarefas de manutenção são executadas automaticamente através do NestJS Schedule. O `ScheduleModule` está configurado no `app.module.ts` e as tarefas são executadas nos seguintes horários:

### Frequências Configuradas

- **Sincronização de status**: A cada 5 minutos
- **Limpeza de sessões antigas**: Diariamente às 2:00 AM
- **Verificação de conversas inativas**: A cada hora

### Execução Manual

Você também pode executar as tarefas manualmente através dos endpoints disponíveis.

## Benefícios

1. **Status sempre atualizado**: O banco reflete o status real da conexão
2. **Detecção automática de problemas**: Identifica desconexões silenciosas
3. **Limpeza automática**: Remove sessões antigas automaticamente
4. **Monitoramento**: Logs detalhados para debugging
5. **Sincronização manual**: Possibilidade de forçar sincronização quando necessário

## Troubleshooting

### Se a sessão aparecer como desconectada no banco mas estiver funcionando:

1. Verifique o status real:
   ```bash
   curl -X GET "http://localhost:3000/whatsapp/status"
   ```

2. Force a sincronização:
   ```bash
   curl -X POST "http://localhost:3000/whatsapp/force-sync-current"
   ```

### Se houver muitas sessões antigas:

O sistema limpa automaticamente sessões com mais de 30 dias sem atividade. Você também pode forçar a limpeza executando:

```bash
curl -X POST "http://localhost:3000/whatsapp/force-sync"
```

## Arquivos Modificados

- `src/whatsapp/whatsapp-session.service.ts` - Métodos de sincronização
- `src/whatsapp/whatsapp.service.ts` - Verificação de status real
- `src/whatsapp/whatsapp-sync.service.ts` - Tarefas agendadas
- `src/whatsapp/whatsapp.controller.ts` - Novos endpoints
- `src/whatsapp/whatsapp.module.ts` - Registro do novo serviço
