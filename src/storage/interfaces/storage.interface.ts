export interface StorageFile {
  originalName: string;
  fileName: string;
  mimeType: string;
  size: number;
  buffer: Buffer;
  url?: string;
}

export interface UploadResult {
  url: string;
  key: string;
  size: number;
  mimeType: string;
}

export interface StorageProvider {
  upload(file: StorageFile, path?: string): Promise<UploadResult>;
  delete(key: string): Promise<void>;
  getSignedUrl(key: string, expiresIn?: number): Promise<string>;
  getPublicUrl(key: string): string;
}
