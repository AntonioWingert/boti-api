import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { StorageController } from './storage.controller';
import { S3StorageProvider } from './providers/s3-storage.provider';
import { LocalStorageProvider } from './providers/local-storage.provider';

@Module({
  providers: [
    StorageService,
    S3StorageProvider,
    LocalStorageProvider,
  ],
  controllers: [StorageController],
  exports: [StorageService],
})
export class StorageModule {}
