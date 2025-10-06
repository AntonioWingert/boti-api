import { 
  Controller, 
  Post, 
  UseInterceptors, 
  UploadedFile, 
  Body, 
  UseGuards, 
  Request,
  Delete,
  Param,
  Get,
  Query
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { StorageService } from './storage.service';
import { JwtAuthGuard } from '../users/jwt-auth.guard';
import { ApiTags, ApiConsumes, ApiBody } from '@nestjs/swagger';

@ApiTags('storage')
@Controller('storage')
@UseGuards(JwtAuthGuard)
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        path: {
          type: 'string',
          description: 'Caminho opcional para organizar os arquivos',
        },
      },
    },
  })
  async uploadFile(
    @UploadedFile() file: any,
    @Request() req: any,
    @Body('path') path?: string
  ) {
    if (!file) {
      throw new Error('Nenhum arquivo foi enviado');
    }

    // Configurações de validação baseadas no tipo de arquivo
    const allowedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const allowedDocumentTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
    const allAllowedTypes = [...allowedImageTypes, ...allowedDocumentTypes];
    
    const maxSize = 10 * 1024 * 1024; // 10MB

    const result = await this.storageService.uploadFile(
      file,
      path || `company-${req.user.companyId}`,
      allAllowedTypes,
      maxSize
    );

    return {
      success: true,
      data: {
        url: result.url,
        key: result.key,
        size: result.size,
        mimeType: result.mimeType,
        originalName: file.originalname,
      },
    };
  }


  @Delete(':key')
  async deleteFile(@Param('key') key: string, @Request() req: any) {
    // Verificar se o arquivo pertence à empresa do usuário
    if (!key.startsWith(`company-${req.user.companyId}`)) {
      throw new Error('Acesso negado ao arquivo');
    }

    await this.storageService.deleteFile(key);

    return {
      success: true,
      message: 'Arquivo deletado com sucesso',
    };
  }

}
