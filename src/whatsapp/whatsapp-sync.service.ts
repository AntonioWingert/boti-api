import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WhatsappService } from './whatsapp.service';
import { WhatsappSessionService } from './whatsapp-session.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WhatsappSyncService {
  private readonly logger = new Logger(WhatsappSyncService.name);

  constructor(
    private readonly whatsappService: WhatsappService,
    private readonly sessionService: WhatsappSessionService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Sincroniza o status das sessões a cada 5 minutos
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async syncSessionsStatus() {
    try {
      this.logger.log('Starting scheduled session status sync...');
      await this.whatsappService.syncAllSessionsStatus();
      this.logger.log('Scheduled session status sync completed');
    } catch (error) {
      this.logger.error('Error in scheduled session status sync:', error);
    }
  }

  /**
   * Limpa sessões antigas diariamente às 2:00 AM
   */
  @Cron('0 2 * * *')
  async cleanupOldSessions() {
    try {
      this.logger.log('Starting scheduled cleanup of old sessions...');
      await this.sessionService.cleanupOldSessions();
      this.logger.log('Scheduled cleanup of old sessions completed');
    } catch (error) {
      this.logger.error('Error in scheduled cleanup of old sessions:', error);
    }
  }

  /**
   * Verifica e encerra conversas inativas a cada hora
   */
  @Cron(CronExpression.EVERY_HOUR)
  async checkInactiveConversations() {
    try {
      this.logger.log('Checking for inactive conversations...');
      const closedCount = await this.whatsappService.checkAndCloseInactiveConversations();
      if (closedCount > 0) {
        this.logger.log(`Closed ${closedCount} inactive conversations`);
      }
    } catch (error) {
      this.logger.error('Error checking inactive conversations:', error);
    }
  }

  /**
   * Sincronização manual imediata (para uso em endpoints)
   */
  async forceSyncAllSessions() {
    try {
      this.logger.log('Starting forced sync of all sessions...');
      await this.whatsappService.syncAllSessionsStatus();
      this.logger.log('Forced sync of all sessions completed');
      return { success: true, message: 'All sessions synced successfully' };
    } catch (error) {
      this.logger.error('Error in forced sync of all sessions:', error);
      return { success: false, message: 'Error syncing sessions', error: error.message };
    }
  }

  /**
   * Sincronização manual da sessão atual (para uso em endpoints)
   */
  async forceSyncCurrentSession() {
    try {
      this.logger.log('Starting forced sync of current session...');
      await this.whatsappService.syncCurrentSessionStatus();
      this.logger.log('Forced sync of current session completed');
      return { success: true, message: 'Current session synced successfully' };
    } catch (error) {
      this.logger.error('Error in forced sync of current session:', error);
      return { success: false, message: 'Error syncing current session', error: error.message };
    }
  }
}
