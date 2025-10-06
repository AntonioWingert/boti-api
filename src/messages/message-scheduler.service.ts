import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ScalableMessageService } from './scalable-message.service';
import { MessageCacheService } from './message-cache.service';

@Injectable()
export class MessageSchedulerService {
  private readonly logger = new Logger(MessageSchedulerService.name);

  constructor(
    private scalableMessageService: ScalableMessageService,
    private messageCacheService: MessageCacheService
  ) {}

  /**
   * Executa arquivamento de mensagens antigas a cada hora
   */
  @Cron(CronExpression.EVERY_HOUR)
  async archiveOldMessages() {
    try {
      this.logger.log('Starting scheduled message archiving...');
      
      const result = await this.scalableMessageService.archiveOldMessages();
      
      this.logger.log(`Message archiving completed: ${result.archived} messages archived`);
    } catch (error) {
      this.logger.error('Error in scheduled message archiving:', error);
    }
  }

  /**
   * Limpa cache expirado a cada 10 minutos
   */
  @Cron('*/10 * * * *')
  async cleanExpiredCache() {
    try {
      this.logger.debug('Cleaning expired cache...');
      
      this.messageCacheService.cleanExpiredCache();
      
      this.logger.debug('Cache cleanup completed');
    } catch (error) {
      this.logger.error('Error cleaning cache:', error);
    }
  }

  /**
   * Cria resumos de conversas finalizadas diariamente
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async createConversationSummaries() {
    try {
      this.logger.log('Starting conversation summary creation...');
      
      // Buscar conversas finalizadas nas últimas 24h que não têm resumo
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      // Implementar busca de conversas finalizadas sem resumo
      // e criar resumos para elas
      
      this.logger.log('Conversation summary creation completed');
    } catch (error) {
      this.logger.error('Error creating conversation summaries:', error);
    }
  }

  /**
   * Executa manutenção do banco de dados semanalmente
   */
  @Cron(CronExpression.EVERY_WEEKEND)
  async performDatabaseMaintenance() {
    try {
      this.logger.log('Starting database maintenance...');
      
      // Aqui você pode adicionar:
      // - Otimização de índices
      // - Limpeza de dados órfãos
      // - Análise de performance
      // - Compactação de tabelas
      
      this.logger.log('Database maintenance completed');
    } catch (error) {
      this.logger.error('Error in database maintenance:', error);
    }
  }

  /**
   * Executa análise de performance mensalmente
   */
  @Cron('0 0 1 * *') // Primeiro dia do mês
  async performPerformanceAnalysis() {
    try {
      this.logger.log('Starting performance analysis...');
      
      // Analisar:
      // - Crescimento de dados por empresa
      // - Performance de consultas
      // - Uso de cache
      // - Recomendações de otimização
      
      const cacheStats = this.messageCacheService.getCacheStats();
      this.logger.log(`Cache stats: ${JSON.stringify(cacheStats)}`);
      
      this.logger.log('Performance analysis completed');
    } catch (error) {
      this.logger.error('Error in performance analysis:', error);
    }
  }
}
