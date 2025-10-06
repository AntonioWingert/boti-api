# Sistema de Armazenamento de Arquivos

Este módulo fornece um sistema genérico de armazenamento de arquivos que pode ser facilmente adaptado para diferentes provedores.

## Configuração

### Variáveis de Ambiente

```env
# Tipo de storage (local ou s3)
STORAGE_TYPE="local"

# Para storage local
UPLOAD_DIR="./uploads"
BASE_URL="http://localhost:3000"

# Para S3
S3_BUCKET_NAME="chatbot-files"
S3_REGION="us-east-1"
S3_ACCESS_KEY_ID="your-access-key"
S3_SECRET_ACCESS_KEY="your-secret-key"
```

## Provedores Suportados

### 1. Local Storage
- Armazena arquivos no sistema de arquivos local
- Ideal para desenvolvimento e testes
- Configuração: `STORAGE_TYPE="local"`

### 2. Amazon S3
- Armazena arquivos na nuvem AWS S3
- Ideal para produção
- Configuração: `STORAGE_TYPE="s3"`

## Endpoints

### Upload de Arquivo Único
```
POST /storage/upload
Content-Type: multipart/form-data

Body:
- file: arquivo
- path: caminho opcional (ex: "company-123/disparos")
```

### Upload de Múltiplos Arquivos
```
POST /storage/upload-multiple
Content-Type: multipart/form-data

Body:
- files: array de arquivos
- path: caminho opcional
```

### Deletar Arquivo
```
DELETE /storage/:key
```

### Obter URL Assinada
```
GET /storage/signed-url/:key?expiresIn=3600
```

## Tipos de Arquivo Suportados

### Imagens
- JPEG, PNG, GIF, WebP
- Tamanho máximo: 10MB

### Documentos
- PDF, DOC, DOCX, TXT
- Tamanho máximo: 10MB

## Segurança

- Arquivos são organizados por empresa (`company-{id}`)
- Usuários só podem acessar arquivos de sua empresa
- URLs assinadas com expiração configurável
- Validação de tipos MIME
- Limite de tamanho de arquivo

## Uso no Frontend

```typescript
// Upload de arquivo
const formData = new FormData();
formData.append('file', file);
formData.append('path', 'disparos');

const response = await api.post('/storage/upload', formData, {
  headers: { 'Content-Type': 'multipart/form-data' }
});

// Usar URL retornada
const { url } = response.data.data;
```

## Adicionando Novos Provedores

1. Implementar a interface `StorageProvider`
2. Adicionar o provedor no `StorageService`
3. Configurar variáveis de ambiente necessárias

Exemplo:
```typescript
export class GoogleCloudStorageProvider implements StorageProvider {
  // Implementar métodos da interface
}
```
