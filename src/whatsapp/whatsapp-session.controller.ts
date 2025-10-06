import { Controller, Get, Post, Put, Delete, Body, Param, Query, Logger } from '@nestjs/common';
import { WhatsappSessionService } from './whatsapp-session.service';
import { WhatsappService } from './whatsapp.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSessionDto } from './dto/create-session.dto';
import type { UpdateSessionDto } from './whatsapp-session.service';
import { SessionStatus } from '@prisma/client';

@Controller('whatsapp/sessions')
export class WhatsappSessionController {
  private readonly logger = new Logger(WhatsappSessionController.name);

  constructor(
    private readonly sessionService: WhatsappSessionService,
    private readonly whatsappService: WhatsappService,
    private readonly prisma: PrismaService
  ) {}

  /**
   * Criar nova sessão do WhatsApp
   */
  @Post()
  async createSession(@Body() data: CreateSessionDto) {
    return this.sessionService.createSession(data);
  }

  /**
   * Listar sessões de uma empresa
   */
  @Get('company/:companyId')
  async getCompanySessions(@Param('companyId') companyId: string) {
    this.logger.log(`GET /whatsapp/sessions/company/${companyId} - Request received`);
    const sessions = await this.sessionService.findByCompany(companyId);
    this.logger.log(`GET /whatsapp/sessions/company/${companyId} - Returning ${sessions.length} sessions`);
    return sessions;
  }

  /**
   * Buscar sessão ativa de uma empresa
   */
  @Get('company/:companyId/active')
  async getActiveSession(@Param('companyId') companyId: string) {
    return this.sessionService.findActiveByCompany(companyId);
  }

  /**
   * Buscar sessão por ID
   */
  @Get(':id')
  async getSession(@Param('id') id: string) {
    return this.sessionService.findById(id);
  }

  /**
   * Verificar status de todas as sessões
   */
  @Get('status/check')
  async checkAllSessionsStatus() {
    try {
      const sessions = await this.sessionService.findAll();
      
      const statusReport = sessions.map(session => ({
        id: session.id,
        sessionName: session.sessionName,
        phoneNumber: session.phoneNumber,
        status: session.status,
        companyName: session.company?.name || 'N/A',
        lastSeen: session.lastSeen,
        error: session.error,
        active: session.active
      }));

      return {
        success: true,
        totalSessions: sessions.length,
        sessions: statusReport,
        message: 'Session status checked successfully'
      };
    } catch (error) {
      this.logger.error('Error checking sessions status:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to check sessions status'
      };
    }
  }

  /**
   * Atualizar sessão
   */
  @Put(':id')
  async updateSession(@Param('id') id: string, @Body() data: UpdateSessionDto) {
    return this.sessionService.updateSession(id, data);
  }

  /**
   * Atualizar status da sessão
   */
  @Put(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status: SessionStatus; error?: string }
  ) {
    return this.sessionService.updateStatus(id, body.status, body.error);
  }

  /**
   * Conectar sessão
   */
  @Put(':id/connect')
  async connectSession(
    @Param('id') id: string,
    @Body() body: { phoneNumber: string }
  ) {
    return this.sessionService.connectSession(id, body.phoneNumber);
  }

  /**
   * Desconectar sessão
   */
  @Put(':id/disconnect')
  async disconnectSession(
    @Param('id') id: string,
    @Body() body: { error?: string }
  ) {
    return this.sessionService.disconnectSession(id, body.error);
  }

  /**
   * Marcar sessão como erro
   */
  @Put(':id/error')
  async markError(@Param('id') id: string, @Body() body: { error: string }) {
    return this.sessionService.markSessionError(id, body.error);
  }

  /**
   * Desativar sessão
   */
  @Put(':id/deactivate')
  async deactivateSession(@Param('id') id: string) {
    return this.sessionService.deactivateSession(id);
  }

  /**
   * Remover sessão
   */
  @Delete(':id')
  async deleteSession(@Param('id') id: string) {
    return this.sessionService.deleteSession(id);
  }

  /**
   * Listar todas as sessões ativas
   */
  @Get()
  async getActiveSessions() {
    return this.sessionService.findActiveSessions();
  }

  /**
   * Listar sessões por status
   */
  @Get('status/:status')
  async getSessionsByStatus(@Param('status') status: SessionStatus) {
    return this.sessionService.findByStatus(status);
  }

  /**
   * Limpar sessões antigas
   */
  @Post('cleanup')
  async cleanupOldSessions() {
    return this.sessionService.cleanupOldSessions();
  }

  /**
   * Gerar QR code para uma sessão específica
   */
  @Post(':id/generate-qr')
  async generateQRCode(@Param('id') id: string) {
    try {
      this.logger.log(`🔄 Generating QR code for session: ${id}`);
      
      // Verificar se a sessão existe
      const session = await this.sessionService.findById(id);
      if (!session) {
        this.logger.error(`❌ Session ${id} not found`);
        throw new Error('Session not found');
      }

      this.logger.log(`✅ Session found: ${session.sessionName} (${session.status})`);

      // Gerar QR code
      this.logger.log(`🚀 Calling generateQRCodeForSession for session: ${id}`);
      const qrCode = await this.whatsappService.generateQRCodeForSession(id);
      
      this.logger.log(`📊 QR code generated, length: ${qrCode?.length}`);
      this.logger.log(`🔍 QR code is base64: ${qrCode?.startsWith('data:image/')}`);
      this.logger.log(`📝 QR code preview: ${qrCode?.substring(0, 100)}...`);
      
      // Verificar se o QR code é válido
      if (!qrCode || qrCode.length < 100) {
        this.logger.error(`❌ Invalid QR code generated: length=${qrCode?.length}`);
        throw new Error('Invalid QR code generated');
      }
      
      // Salvar o QR code na sessão
      this.logger.log(`💾 Saving QR code to session ${id}`);
      await this.sessionService.updateSession(id, {
        qrCode: qrCode,
        status: SessionStatus.CONNECTING
      });
      
      this.logger.log(`✅ QR code saved to session ${id}`);
      
      return {
        success: true,
        sessionId: id,
        qrCode: qrCode,
        message: 'QR code generated successfully'
      };
    } catch (error) {
      this.logger.error(`❌ Error generating QR code for session ${id}:`, error);
      this.logger.error(`❌ Error stack:`, error.stack);
      
      // Não quebrar a aplicação, apenas retornar erro controlado
      this.logger.warn(`⚠️ QR code generation failed for session ${id}, but application continues`);
      
      return {
        success: false,
        sessionId: id,
        error: error.message,
        message: 'Failed to generate QR code - please try again'
      };
    }
  }

  /**
   * Conectar Baileys e gerar QR code (rota simplificada para teste)
   */
  @Post('connect-baileys')
  async connectBaileys(@Body() body: { sessionName?: string; companyId?: string }) {
    try {
      const sessionName = body.sessionName || 'test-session';
      const companyId = body.companyId || 'default-company';

      this.logger.log(`Connecting Baileys with session: ${sessionName}`);

      // Criar sessão temporária se não existir
      let session = await this.sessionService.findByCompany(companyId);
      if (!session || session.length === 0) {
        // Criar empresa padrão se não existir
        const defaultCompany = await this.prisma.company.findFirst({
          where: { active: true }
        });

        if (!defaultCompany) {
          return {
            success: false,
            error: 'No active company found. Please create a company first.',
            message: 'Failed to connect Baileys'
          };
        }

        // Criar sessão
        session = [await this.sessionService.createSession({
          companyId: defaultCompany.id,
          sessionName: sessionName
        })];
      }

      const sessionId = session[0].id;

      // Gerar QR code
      const qrCode = await this.whatsappService.generateQRCodeForSession(sessionId);
      
      return {
        success: true,
        sessionId: sessionId,
        sessionName: sessionName,
        companyId: session[0].companyId,
        qrCode: qrCode,
        message: 'Baileys connected successfully. Scan QR code with WhatsApp.',
        instructions: [
          '1. Open WhatsApp on your phone',
          '2. Go to Settings > Linked Devices',
          '3. Tap "Link a Device"',
          '4. Scan the QR code below',
          '5. Wait for connection confirmation'
        ]
      };
    } catch (error) {
      this.logger.error('Error connecting Baileys:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to connect Baileys'
      };
    }
  }

  /**
   * Testar conexão Baileys (rota mais simples) - PÚBLICA
   */
  @Post('test-connection')
  async testBaileysConnection() {
    try {
      this.logger.log('Testing Baileys connection...');

      // Inicializar provider se não estiver inicializado
      await this.whatsappService.initializeProvider();
      
      return {
        success: true,
        message: 'Baileys connection test initiated',
        status: 'Provider initialized successfully'
      };
    } catch (error) {
      this.logger.error('Error testing Baileys connection:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to test Baileys connection'
      };
    }
  }

  /**
   * Obter estatísticas das sessões
   */
  @Get('stats')
  async getSessionStats() {
    try {
      const total = await this.prisma.whatsAppSession.count();
      const connected = await this.prisma.whatsAppSession.count({
        where: { status: 'CONNECTED' }
      });
      const disconnected = await this.prisma.whatsAppSession.count({
        where: { status: 'DISCONNECTED' }
      });
      const connecting = await this.prisma.whatsAppSession.count({
        where: { status: 'CONNECTING' }
      });

      return {
        total,
        connected,
        disconnected,
        connecting,
        change: total > 0 ? Math.round(((connected / total) * 100) - 50) : 0
      };
    } catch (error) {
      // Retornar dados padrão em caso de erro
      return {
        total: 0,
        connected: 0,
        disconnected: 0,
        connecting: 0,
        change: 0
      };
    }
  }

  /**
   * Obter sessões recentes
   */
  @Get('recent')
  async getRecentSessions(@Query('limit') limit: string = '5') {
    try {
      return this.prisma.whatsAppSession.findMany({
        orderBy: { updatedAt: 'desc' },
        take: parseInt(limit),
        include: {
          company: {
            select: { name: true }
          }
        }
      });
    } catch (error) {
      // Retornar array vazio em caso de erro
      return [];
    }
  }

  /**
   * Verificar status da conexão WhatsApp
   */
  @Get('status/connection')
  async checkConnectionStatus() {
    try {
      const status = await this.whatsappService.checkConnectionStatus();
      return {
        success: true,
        status,
        message: 'Connection status checked successfully'
      };
    } catch (error) {
      this.logger.error('Error checking connection status:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to check connection status'
      };
    }
  }


  /**
   * Regenerar conexão de uma sessão específica
   */
  @Post(':id/regenerate')
  async regenerateSession(@Param('id') id: string) {
    try {
      this.logger.log(`🔄 Regenerating session: ${id}`);
      
      // Usar o método público do WhatsappService
      const result = await this.whatsappService.regenerateSession(id);
      
      return result;
      
    } catch (error) {
      this.logger.error(`Error regenerating session ${id}:`, error);
      
      return {
        success: false,
        error: error.message,
        message: 'Failed to regenerate session'
      };
    }
  }

}
