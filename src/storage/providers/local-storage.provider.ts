import { Injectable } from '@nestjs/common';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { StorageProvider, StorageFile, UploadResult } from '../interfaces/storage.interface';

@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private uploadDir: string;

  constructor() {
    this.uploadDir = process.env.UPLOAD_DIR || './uploads';
    this.ensureUploadDir();
  }

  async upload(file: StorageFile, path?: string): Promise<UploadResult> {
    const fileName = file.fileName;
    const filePath = path ? join(this.uploadDir, path, fileName) : join(this.uploadDir, fileName);
    
    // Criar diretório se não existir
    const dir = path ? join(this.uploadDir, path) : this.uploadDir;
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    await writeFile(filePath, file.buffer);

    return {
      url: this.getPublicUrl(path ? `${path}/${fileName}` : fileName),
      key: path ? `${path}/${fileName}` : fileName,
      size: file.size,
      mimeType: file.mimeType,
    };
  }

  async delete(key: string): Promise<void> {
    const filePath = join(this.uploadDir, key);
    try {
      await unlink(filePath);
    } catch (error) {
      // Arquivo não existe, não é um erro crítico
      console.warn(`Arquivo não encontrado para deletar: ${filePath}`);
    }
  }

  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    // Para storage local, retornamos a URL pública
    return this.getPublicUrl(key);
  }

  getPublicUrl(key: string): string {
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    return `${baseUrl}/uploads/${key}`;
  }

  private async ensureUploadDir(): Promise<void> {
    if (!existsSync(this.uploadDir)) {
      await mkdir(this.uploadDir, { recursive: true });
    }
  }
}
