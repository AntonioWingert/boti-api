# ----------------------------
# STAGE 1 — Build da aplicação
# ----------------------------
    FROM node:20-alpine AS builder

    # Instalar dependências de sistema necessárias para Prisma e build
    RUN apk add --no-cache openssl git
    
    # Definir diretório de trabalho
    WORKDIR /app
    
    # Copiar apenas arquivos de dependências primeiro (para cache eficiente)
    COPY package*.json ./
    
    # Instalar dependências (todas, incluindo dev)
    RUN npm install --legacy-peer-deps --no-audit --no-fund
    
    # Copiar todo o código fonte
    COPY . .
    
    # Gerar o cliente Prisma
    RUN npx prisma generate
    
    # Compilar o projeto (gera ./dist)
    RUN npm run build
    
    # ----------------------------
    # STAGE 2 — Execução em produção
    # ----------------------------
    FROM node:20-alpine AS runner
    
    # Instalar apenas o necessário (OpenSSL para Prisma Client)
    RUN apk add --no-cache openssl
    
    # Definir diretório de trabalho
    WORKDIR /app
    
    # Copiar apenas os arquivos essenciais da build
    COPY package*.json ./
    
    # Instalar apenas dependências de produção
    RUN npm install --omit=dev --legacy-peer-deps --no-audit --no-fund && npm cache clean --force
    
    # Copiar build compilado e arquivos necessários do builder
    COPY --from=builder /app/dist ./dist
    COPY --from=builder /app/prisma ./prisma
    
    # Variáveis de ambiente
    ENV NODE_ENV=production
    ENV PORT=3000
    
    # Expor porta
    EXPOSE 3000
    
    # Comando de inicialização
    CMD ["node", "dist/main.js"]
    