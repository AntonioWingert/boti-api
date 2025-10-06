import { Injectable, BadRequestException } from '@nestjs/common';
import { StorageProvider } from './interfaces/storage.interface';
import { S3StorageProvider } from './providers/s3-storage.provider';
import { LocalStorageProvider } from './providers/local-storage.provider';

@Injectable()
export class StorageService {
  private provider: StorageProvider;

  constructor() {
    // Escolher o provedor baseado na configuração
    const storageType = process.env.STORAGE_TYPE || 'local';
    
    switch (storageType) {
      case 's3':
        this.provider = new S3StorageProvider();
        break;
      case 'local':
      default:
        this.provider = new LocalStorageProvider();
        break;
    }
  }

  async uploadFile(
    file: Express.Multer.File,
    path?: string,
    allowedMimeTypes?: string[],
    maxSize?: number
  ): Promise<{ url: string; key: string; size: number; mimeType: string }> {
    // Validar tipo de arquivo
    if (allowedMimeTypes && !allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Tipo de arquivo não permitido. Tipos aceitos: ${allowedMimeTypes.join(', ')}`
      );
    }

    // Validar tamanho
    if (maxSize && file.size > maxSize) {
      throw new BadRequestException(
        `Arquivo muito grande. Tamanho máximo: ${this.formatBytes(maxSize)}`
      );
    }

    // Gerar nome único para o arquivo
    const fileName = this.generateFileName(file.originalname);
    
    const storageFile = {
      originalName: file.originalname,
      fileName,
      mimeType: file.mimetype,
      size: file.size,
      buffer: file.buffer,
    };

    return this.provider.upload(storageFile, path);
  }

  async deleteFile(key: string): Promise<void> {
    return this.provider.delete(key);
  }

  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    return this.provider.getSignedUrl(key, expiresIn);
  }

  getPublicUrl(key: string): string {
    return this.provider.getPublicUrl(key);
  }

  private generateFileName(originalName: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const extension = originalName.split('.').pop();
    return `${timestamp}-${random}.${extension}`;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
