# Use Node.js 18 Alpine como base
FROM node:18-alpine

# Instalar dependências do sistema necessárias para Prisma e git
RUN apk add --no-cache openssl git

# Definir diretório de trabalho
WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências (incluindo dev para build)
RUN npm install --legacy-peer-deps

# Copiar código fonte
COPY . .

# Gerar cliente Prisma
RUN npx prisma generate

# Compilar a aplicação
RUN npm run build

# Expor porta
EXPOSE 3000

# Comando para iniciar a aplicação
CMD ["npm", "run", "start:prod"]
