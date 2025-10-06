import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappSyncService } from './whatsapp-sync.service';
import { JwtAuthGuard } from '../users/jwt-auth.guard';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@Controller('whatsapp')
export class WhatsappController {
  constructor(
    private readonly whatsappService: WhatsappService,
    private readonly whatsappSyncService: WhatsappSyncService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('webhook')
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    return this.whatsappService.verifyWebhook(mode, token, challenge);
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  handleWebhook(@Body() body: any) {
    return this.whatsappService.handleWebhook(body);
  }

  @Post('send-message')
  @UseGuards(JwtAuthGuard)
  sendMessage(
    @Body('phoneNumber') phoneNumber: string,
    @Body('message') message: string,
  ) {
    return this.whatsappService.sendMessage(phoneNumber, message);
  }

  @Post('send-template')
  @UseGuards(JwtAuthGuard)
  sendTemplateMessage(
    @Body('phoneNumber') phoneNumber: string,
    @Body('templateName') templateName: string,
    @Body('parameters') parameters: string[] = [],
  ) {
    return this.whatsappService.sendTemplateMessage(phoneNumber, templateName, parameters);
  }

  @Get('health')
  async getHealth() {
    try {
      const isConnected = await this.whatsappService.isActuallyConnected();
      const providerType = this.whatsappService.getProviderType();
      
      return {
        status: isConnected ? 'healthy' : 'unhealthy',
        connected: isConnected,
        provider: providerType,
        timestamp: new Date().toISOString(),
        message: isConnected ? 'WhatsApp connection is active' : 'WhatsApp connection is not available'
      };
    } catch (error) {
      return {
        status: 'error',
        connected: false,
        error: error.message,
        timestamp: new Date().toISOString(),
        message: 'Error checking WhatsApp connection status'
      };
    }
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  async getConnectionStatus() {
    const isConnected = await this.whatsappService.isActuallyConnected();
    return {
      connected: isConnected,
      timestamp: new Date().toISOString()
    };
  }

  @Post('sync-status')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async syncSessionStatus() {
    await this.whatsappService.syncCurrentSessionStatus();
    return {
      message: 'Session status synchronized successfully',
      timestamp: new Date().toISOString()
    };
  }

  @Post('sync-all-sessions')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async syncAllSessionsStatus() {
    await this.whatsappService.syncAllSessionsStatus();
    return {
      message: 'All sessions status synchronized successfully',
      timestamp: new Date().toISOString()
    };
  }

  @Get('debug/connection-status')
  @UseGuards(JwtAuthGuard)
  async getDebugConnectionStatus() {
    const isConnected = await this.whatsappService.isActuallyConnected();
    const sessionId = this.configService.get<string>('WHATSAPP_SESSION_ID', 'default-session');
    
    // Buscar sessão no banco
    const session = await this.prisma.whatsAppSession.findUnique({
      where: { id: sessionId }
    });

    return {
      sessionId,
      isActuallyConnected: isConnected,
      sessionStatus: session?.status,
      sessionPhoneNumber: session?.phoneNumber,
      sessionLastSeen: session?.lastSeen,
      sessionError: session?.error,
      timestamp: new Date().toISOString()
    };
  }

  @Post('force-sync')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async forceSyncAllSessions() {
    await this.whatsappService.syncCurrentSessionStatus();
    await this.whatsappService.syncAllSessionsStatus();
    return {
      message: 'Force sync completed successfully',
      timestamp: new Date().toISOString()
    };
  }

  @Post('force-connect-current')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async forceConnectCurrentSession() {
    try {
      const isConnected = await this.whatsappService.isActuallyConnected();
      const sessionId = this.configService.get<string>('WHATSAPP_SESSION_ID', 'default-session');
      
      if (isConnected) {
        // Se está conectado, forçar atualização do status
        const session = await this.prisma.whatsAppSession.findUnique({
          where: { id: sessionId }
        });
        
        if (session && session.status !== 'CONNECTED') {
          await this.prisma.whatsAppSession.update({
            where: { id: sessionId },
            data: {
              status: 'CONNECTED',
              lastSeen: new Date(),
              error: undefined
            }
          });
          
          return {
            message: 'Session status updated to CONNECTED',
            sessionId,
            wasConnected: true,
            timestamp: new Date().toISOString()
          };
        }
        
        return {
          message: 'Session is already CONNECTED',
          sessionId,
          wasConnected: true,
          timestamp: new Date().toISOString()
        };
      } else {
        return {
          message: 'Session is not actually connected',
          sessionId,
          wasConnected: false,
          timestamp: new Date().toISOString()
        };
      }
    } catch (error) {
      return {
        message: 'Error checking connection status',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}
