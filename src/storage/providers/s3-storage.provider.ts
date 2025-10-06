import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageProvider, StorageFile, UploadResult } from '../interfaces/storage.interface';

@Injectable()
export class S3StorageProvider implements StorageProvider {
  private s3Client: S3Client;
  private bucketName: string;

  constructor() {
    this.bucketName = process.env.S3_BUCKET_NAME || 'chatbot-files';
    
    this.s3Client = new S3Client({
      region: process.env.S3_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
      },
    });
  }
  
  async upload(file: StorageFile, path?: string): Promise<UploadResult> {
    const key = path ? `${path}/${file.fileName}` : file.fileName;
    
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimeType,
      ContentLength: file.size,
      ACL: 'public-read', // Para arquivos públicos
    });

    await this.s3Client.send(command);

    return {
      url: this.getPublicUrl(key),
      key,
      size: file.size,
      mimeType: file.mimeType,
    };
  }

  async delete(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    await this.s3Client.send(command);
  }

  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    return getSignedUrl(this.s3Client, command, { expiresIn });
  }

  getPublicUrl(key: string): string {
    const region = process.env.S3_REGION || 'us-east-1';
    return `https://${this.bucketName}.s3.${region}.amazonaws.com/${key}`;
  }
}
