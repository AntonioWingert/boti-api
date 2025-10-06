-- Script de inicialização do banco de dados
-- Este arquivo é executado automaticamente quando o container MySQL é criado

-- Criar usuário específico para a aplicação (já criado via environment)
-- CREATE USER 'chatbot_user'@'%' IDENTIFIED BY 'chatbot_password';
-- GRANT ALL PRIVILEGES ON chatbot_api.* TO 'chatbot_user'@'%';
-- FLUSH PRIVILEGES;

-- O banco de dados e usuário já são criados automaticamente via environment variables
-- As tabelas serão criadas pelo Prisma quando a aplicação iniciar
