-- Script de migração para implementar sistema escalável de mensagens
-- Execute este script após aplicar as mudanças do Prisma

-- 1. Criar tabela de mensagens
CREATE TABLE IF NOT EXISTS messages (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  content TEXT NOT NULL,
  sender ENUM('CLIENT', 'SYSTEM', 'AGENT', 'CHATBOT') NOT NULL DEFAULT 'CLIENT',
  messageType ENUM('TEXT', 'IMAGE', 'AUDIO', 'VIDEO', 'DOCUMENT', 'LOCATION', 'CONTACT', 'STICKER') NOT NULL DEFAULT 'TEXT',
  metadata JSON NULL,
  isRead BOOLEAN NOT NULL DEFAULT FALSE,
  isDelivered BOOLEAN NOT NULL DEFAULT FALSE,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL,
  
  -- Estratégia de arquivamento
  storageTier ENUM('HOT', 'WARM', 'COLD') NOT NULL DEFAULT 'HOT',
  archivedAt DATETIME(3) NULL,
  archivedPath VARCHAR(500) NULL,
  
  -- Relacionamentos
  conversationId VARCHAR(191) NOT NULL,
  clientId VARCHAR(191) NOT NULL,
  companyId VARCHAR(191) NOT NULL,
  
  -- Índices para performance
  INDEX idx_messages_conversation_created (conversationId, createdAt),
  INDEX idx_messages_client_created (clientId, createdAt),
  INDEX idx_messages_company_created (companyId, createdAt),
  INDEX idx_messages_storage_created (storageTier, createdAt),
  
  -- Foreign keys
  FOREIGN KEY (conversationId) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (clientId) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Criar tabela de resumos de conversa
CREATE TABLE IF NOT EXISTS conversation_summaries (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  conversationId VARCHAR(191) NOT NULL UNIQUE,
  summary TEXT NOT NULL,
  keyPoints JSON NULL,
  sentiment VARCHAR(50) NULL,
  tags JSON NOT NULL DEFAULT ('[]'),
  messageCount INT NOT NULL DEFAULT 0,
  duration INT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL,
  
  -- Foreign key
  FOREIGN KEY (conversationId) REFERENCES conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Adicionar coluna de resumo na tabela de conversas
ALTER TABLE conversations 
ADD COLUMN summary_id VARCHAR(191) NULL,
ADD FOREIGN KEY (summary_id) REFERENCES conversation_summaries(id) ON DELETE SET NULL;

-- 4. Criar índices adicionais para otimização
CREATE INDEX idx_conversations_last_message ON conversations(lastMessageAt);
CREATE INDEX idx_conversations_status_updated ON conversations(status, updatedAt);
CREATE INDEX idx_messages_sender_created ON messages(sender, createdAt);

-- 5. Criar view para estatísticas de mensagens por empresa
CREATE OR REPLACE VIEW message_stats_by_company AS
SELECT 
  c.id as company_id,
  c.name as company_name,
  COUNT(m.id) as total_messages,
  COUNT(CASE WHEN m.storageTier = 'HOT' THEN 1 END) as hot_messages,
  COUNT(CASE WHEN m.storageTier = 'WARM' THEN 1 END) as warm_messages,
  COUNT(CASE WHEN m.storageTier = 'COLD' THEN 1 END) as cold_messages,
  COUNT(CASE WHEN m.sender = 'CLIENT' THEN 1 END) as client_messages,
  COUNT(CASE WHEN m.sender = 'CHATBOT' THEN 1 END) as chatbot_messages,
  COUNT(CASE WHEN m.sender = 'AGENT' THEN 1 END) as agent_messages,
  COUNT(CASE WHEN m.createdAt >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as messages_last_24h,
  COUNT(CASE WHEN m.createdAt >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) as messages_last_7d,
  COUNT(CASE WHEN m.createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as messages_last_30d
FROM companies c
LEFT JOIN messages m ON c.id = m.companyId
GROUP BY c.id, c.name;

-- 6. Criar view para estatísticas de conversas
CREATE OR REPLACE VIEW conversation_stats AS
SELECT 
  c.id as conversation_id,
  c.status,
  c.priority,
  c.escalated,
  c.createdAt as conversation_start,
  c.finishedAt as conversation_end,
  c.lastMessageAt,
  TIMESTAMPDIFF(MINUTE, c.createdAt, COALESCE(c.finishedAt, NOW())) as duration_minutes,
  COUNT(m.id) as message_count,
  COUNT(CASE WHEN m.sender = 'CLIENT' THEN 1 END) as client_message_count,
  COUNT(CASE WHEN m.sender = 'CHATBOT' THEN 1 END) as chatbot_message_count,
  COUNT(CASE WHEN m.sender = 'AGENT' THEN 1 END) as agent_message_count
FROM conversations c
LEFT JOIN messages m ON c.id = m.conversationId
GROUP BY c.id, c.status, c.priority, c.escalated, c.createdAt, c.finishedAt, c.lastMessageAt;

-- 7. Criar stored procedure para arquivamento automático
DELIMITER //
CREATE PROCEDURE ArchiveOldMessages()
BEGIN
  DECLARE done INT DEFAULT FALSE;
  DECLARE batch_size INT DEFAULT 1000;
  DECLARE archived_count INT DEFAULT 0;
  
  -- Mover mensagens antigas da camada WARM para COLD
  UPDATE messages 
  SET 
    storageTier = 'COLD',
    archivedAt = NOW(),
    archivedPath = CONCAT('archive/', YEAR(NOW()), '/', MONTH(NOW()), '/messages.json')
  WHERE 
    storageTier = 'WARM' 
    AND createdAt < DATE_SUB(NOW(), INTERVAL 30 DAY)
    AND id IN (
      SELECT id FROM (
        SELECT id FROM messages 
        WHERE storageTier = 'WARM' 
        AND createdAt < DATE_SUB(NOW(), INTERVAL 30 DAY)
        LIMIT batch_size
      ) AS temp
    );
  
  SET archived_count = ROW_COUNT();
  
  -- Mover mensagens antigas da camada HOT para WARM
  UPDATE messages 
  SET storageTier = 'WARM'
  WHERE 
    storageTier = 'HOT' 
    AND createdAt < DATE_SUB(NOW(), INTERVAL 1 DAY)
    AND id IN (
      SELECT id FROM (
        SELECT id FROM messages 
        WHERE storageTier = 'HOT' 
        AND createdAt < DATE_SUB(NOW(), INTERVAL 1 DAY)
        ORDER BY createdAt ASC
        LIMIT batch_size
      ) AS temp
    );
  
  SELECT CONCAT('Archived ', archived_count, ' messages to cold storage') as result;
END //
DELIMITER ;

-- 8. Criar evento para executar arquivamento automaticamente
CREATE EVENT IF NOT EXISTS auto_archive_messages
ON SCHEDULE EVERY 1 HOUR
DO
  CALL ArchiveOldMessages();

-- 9. Habilitar event scheduler
SET GLOBAL event_scheduler = ON;

-- 10. Inserir dados de exemplo para teste
INSERT INTO messages (id, content, sender, messageType, conversationId, clientId, companyId, storageTier, createdAt)
SELECT 
  CONCAT('msg_', ROW_NUMBER() OVER()) as id,
  CONCAT('Mensagem de teste ', ROW_NUMBER() OVER()) as content,
  CASE WHEN ROW_NUMBER() OVER() % 2 = 0 THEN 'CLIENT' ELSE 'CHATBOT' END as sender,
  'TEXT' as messageType,
  c.id as conversationId,
  c.clientId,
  c.companyId,
  'HOT' as storageTier,
  DATE_SUB(NOW(), INTERVAL FLOOR(RAND() * 24) HOUR) as createdAt
FROM conversations c
LIMIT 10;

-- 11. Verificar se as tabelas foram criadas corretamente
SELECT 
  TABLE_NAME,
  TABLE_ROWS,
  DATA_LENGTH,
  INDEX_LENGTH
FROM information_schema.TABLES 
WHERE TABLE_SCHEMA = DATABASE() 
AND TABLE_NAME IN ('messages', 'conversation_summaries');

-- 12. Verificar estatísticas
SELECT * FROM message_stats_by_company LIMIT 5;
SELECT * FROM conversation_stats LIMIT 5;
