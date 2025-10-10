# -----------------------------
# Etapa 1 - Build
# -----------------------------
    FROM node:18-alpine AS builder

    # Instalar dependências do sistema
    RUN apk add --no-cache openssl git
    
    # Diretório de trabalho
    WORKDIR /app
    
    # Copiar arquivos de dependência
    COPY package*.json ./
    
    # Instalar dependências (todas, para build e Prisma)
    RUN npm ci --legacy-peer-deps --no-audit --no-fund
    
    # Copiar o código fonte
    COPY . .
    
    # Gerar cliente Prisma
    RUN npx prisma generate
    
    # Compilar o projeto
    RUN npm run build
    
    # -----------------------------
    # Etapa 2 - Runtime
    # -----------------------------
    FROM node:18-alpine
    
    # Instalar dependências necessárias (openssl para Prisma)
    RUN apk add --no-cache openssl
    
    WORKDIR /app
    
    # Copiar apenas arquivos necessários para rodar
    COPY package*.json ./
    RUN npm ci --omit=dev --legacy-peer-deps --no-audit --no-fund && npm cache clean --force
    
    # Copiar build e Prisma Client do builder
    COPY --from=builder /app/dist ./dist
    COPY --from=builder /app/prisma ./prisma
    
    # Variáveis de ambiente padrão
    ENV NODE_ENV=production
    ENV PORT=3000
    
    EXPOSE 3000
    
    # Comando para iniciar
    CMD ["npm", "run", "start:prod"]
    