import { Injectable, Logger } from '@nestjs/common';
import { EventsGateway } from './events.gateway';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly eventsGateway: EventsGateway,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Notifica mudança de status de uma sessão
   */
  async notifySessionStatusChange(sessionId: string, status: string, additionalData?: any) {
    try {
      this.logger.log(`🔔 notifySessionStatusChange called for session: ${sessionId}, status: ${status}`);
      
      const session = await this.prisma.whatsAppSession.findUnique({
        where: { id: sessionId },
        include: { company: true },
      });

      if (!session) {
        this.logger.warn(`Session ${sessionId} not found for status change notification`);
        return;
      }

      const sessionData = {
        id: session.id,
        sessionName: session.sessionName,
        status,
        phoneNumber: session.phoneNumber,
        lastSeen: session.lastSeen,
        qrCode: session.qrCode,
        error: session.error,
        ...additionalData,
      };

      this.logger.log(`📡 Emitting session status change to company: ${session.companyId}`);
      this.eventsGateway.emitSessionStatusChange(session.companyId, sessionData);
      
      this.logger.log(`📡 Session status change notified: ${sessionId} -> ${status}`);
      this.logger.log(`📊 Session data sent:`, sessionData);
    } catch (error) {
      this.logger.error('Error notifying session status change:', error);
    }
  }

  /**
   * Notifica geração de QR Code
   */
  async notifyQRCodeGenerated(sessionId: string, qrCode: string) {
    try {
      const session = await this.prisma.whatsAppSession.findUnique({
        where: { id: sessionId },
        include: { company: true },
      });

      if (!session) {
        this.logger.warn(`Session ${sessionId} not found for QR code notification`);
        return;
      }

      this.eventsGateway.emitQRCodeGenerated(session.companyId, sessionId, qrCode);
      
      this.logger.log(`QR Code generated notification sent for session: ${sessionId}`);
    } catch (error) {
      this.logger.error('Error notifying QR code generation:', error);
    }
  }

  /**
   * Notifica erro de conexão
   */
  async notifyConnectionError(sessionId: string, error: string) {
    try {
      const session = await this.prisma.whatsAppSession.findUnique({
        where: { id: sessionId },
        include: { company: true },
      });

      if (!session) {
        this.logger.warn(`Session ${sessionId} not found for error notification`);
        return;
      }

      this.eventsGateway.emitConnectionError(session.companyId, sessionId, error);
      
      this.logger.log(`Connection error notification sent for session: ${sessionId}`);
    } catch (error) {
      this.logger.error('Error notifying connection error:', error);
    }
  }

  /**
   * Notifica sucesso de conexão
   */
  async notifyConnectionSuccess(sessionId: string, phoneNumber?: string) {
    try {
      this.logger.log(`🔔 notifyConnectionSuccess called for session: ${sessionId}, phone: ${phoneNumber}`);
      
      const session = await this.prisma.whatsAppSession.findUnique({
        where: { id: sessionId },
        include: { company: true },
      });

      if (!session) {
        this.logger.warn(`Session ${sessionId} not found for success notification`);
        return;
      }

      this.logger.log(`📡 Emitting connection success to company: ${session.companyId}`);
      this.eventsGateway.emitConnectionSuccess(session.companyId, sessionId, phoneNumber);
      
      this.logger.log(`Connection success notification sent for session: ${sessionId}`);
    } catch (error) {
      this.logger.error('Error notifying connection success:', error);
    }
  }

  /**
   * Notifica mudança em múltiplas sessões (útil para atualizações em lote)
   */
  async notifyMultipleSessions(companyId: string, sessions: any[]) {
    try {
      this.eventsGateway.broadcastToCompany(companyId, 'sessions-updated', {
        sessions,
        count: sessions.length,
      });
      
      this.logger.log(`Multiple sessions updated notification sent for company: ${companyId}`);
    } catch (error) {
      this.logger.error('Error notifying multiple sessions:', error);
    }
  }

  /**
   * Notifica estatísticas do sistema
   */
  async notifySystemStats() {
    try {
      const stats = this.eventsGateway.getConnectionStats();
      
      // Usar o método do gateway para emitir para todos os clientes
      this.eventsGateway.emitToAll('system-stats', stats);
      
      this.logger.log('System stats notification sent');
    } catch (error) {
      this.logger.error('Error notifying system stats:', error);
    }
  }
}
