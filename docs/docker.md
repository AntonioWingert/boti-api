# 🐳 Configuração do Docker

## 📋 Serviços Incluídos

- **MySQL 8.0** - Banco de dados principal
- **NestJS API** - Aplicação principal
- **phpMyAdmin** - Interface web para gerenciar o banco

## 🚀 Como Usar

### Iniciar o Ambiente

```bash
# Usando o script unificado
./scripts.sh dev

# Ou diretamente com docker-compose
docker-compose up -d
```

### Parar o Ambiente

```bash
./scripts.sh down
```

### Comandos Úteis

```bash
# Ver logs da aplicação
./scripts.sh logs

# Ver logs do banco de dados
./scripts.sh db-logs

# Abrir shell na aplicação
./scripts.sh shell

# Abrir shell no MySQL
./scripts.sh db-shell

# Executar migrações do Prisma
./scripts.sh db-push

# Reiniciar apenas a aplicação
./scripts.sh restart
```

## 🔧 Configuração

### Portas

- **Aplicação**: http://localhost:3000
- **phpMyAdmin**: http://localhost:8080
- **MySQL**: localhost:3306

### Credenciais do Banco

- **Host**: mysql (dentro do Docker) / localhost (externo)
- **Porta**: 3306
- **Database**: chatbot_api
- **Usuário**: chatbot_user
- **Senha**: chatbot_password
- **Root**: password

### Variáveis de Ambiente

As variáveis estão configuradas no `docker-compose.yml` e no arquivo `.env`.

## 🗄️ Banco de Dados

O Prisma irá criar automaticamente as tabelas quando a aplicação iniciar pela primeira vez. Se precisar executar migrações manualmente:

```bash
./scripts.sh db-push
```

## 🧹 Limpeza

Para limpar completamente o ambiente (containers, volumes e imagens):

```bash
./scripts.sh clean
```

## 📝 Desenvolvimento

Para desenvolvimento, você pode:

1. Fazer alterações no código localmente
2. Os volumes estão montados para hot-reload
3. Usar `./scripts.sh logs` para acompanhar as mudanças
4. Usar `./scripts.sh restart` para reiniciar a aplicação

## 🔍 Troubleshooting

### Aplicação não inicia
```bash
# Verificar logs
./scripts.sh logs

# Verificar se o banco está rodando
./scripts.sh db-logs
```

### Problemas de conexão com o banco
```bash
# Verificar se o MySQL está acessível
./scripts.sh db-shell
```

### Reconstruir tudo do zero
```bash
./scripts.sh clean
./scripts.sh build
./scripts.sh up
```

## 📚 Configuração WSL2

Para usar no WSL2, você precisa:

1. **Docker Desktop** instalado no Windows
2. **WSL2** habilitado
3. **Integração WSL2** ativada no Docker Desktop

### Passos:

1. Baixe o Docker Desktop: https://www.docker.com/products/docker-desktop/
2. Durante a instalação, marque "Use WSL 2 based engine"
3. Abra o Docker Desktop → Settings → Resources → WSL Integration
4. Ative a integração com sua distribuição WSL (Ubuntu)
5. Clique em "Apply & Restart"

### Verificar Instalação

```bash
docker --version
docker-compose --version
```

Se os comandos funcionarem, a integração está configurada corretamente.
