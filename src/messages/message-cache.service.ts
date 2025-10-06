import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CachedMessage {
  id: string;
  content: string;
  sender: string;
  createdAt: Date;
  conversationId: string;
}

export interface ConversationCache {
  id: string;
  lastMessage: string;
  lastMessageAt: Date;
  messageCount: number;
  clientId: string;
  companyId: string;
}

@Injectable()
export class MessageCacheService {
  private readonly logger = new Logger(MessageCacheService.name);
  private readonly cache = new Map<string, any>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutos
  private readonly MAX_CACHE_SIZE = 1000;

  constructor(private prisma: PrismaService) {}

  /**
   * Busca mensagens recentes com cache
   */
  async getRecentMessages(conversationId: string, limit: number = 20): Promise<CachedMessage[]> {
    const cacheKey = `messages:${conversationId}:${limit}`;
    
    // Verificar cache
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for messages: ${conversationId}`);
      return cached;
    }

    // Buscar do banco
    const messages = await this.prisma.message.findMany({
      where: { 
        conversationId,
        storageTier: 'HOT' // Apenas mensagens recentes
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        content: true,
        sender: true,
        createdAt: true,
        conversationId: true
      }
    });

    // Armazenar no cache
    this.setCache(cacheKey, messages);
    
    return messages;
  }

  /**
   * Busca conversas ativas com cache
   */
  async getActiveConversations(companyId: string): Promise<ConversationCache[]> {
    const cacheKey = `conversations:active:${companyId}`;
    
    // Verificar cache
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for active conversations: ${companyId}`);
      return cached;
    }

    // Buscar do banco
    const conversations = await this.prisma.conversation.findMany({
      where: { 
        companyId,
        status: 'ACTIVE'
      },
      include: {
        client: true,
        _count: {
          select: { messages: true }
        }
      },
      orderBy: { lastMessageAt: 'desc' },
      take: 50
    });

    const conversationCache: ConversationCache[] = conversations.map(conv => ({
      id: conv.id,
      lastMessage: conv.lastMessage || '',
      lastMessageAt: conv.lastMessageAt || conv.createdAt,
      messageCount: conv._count.messages,
      clientId: conv.clientId,
      companyId: conv.companyId
    }));

    // Armazenar no cache
    this.setCache(cacheKey, conversationCache);
    
    return conversationCache;
  }

  /**
   * Busca estatísticas de mensagens com cache
   */
  async getMessageStats(companyId: string, days: number = 7) {
    const cacheKey = `stats:messages:${companyId}:${days}`;
    
    // Verificar cache
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for message stats: ${companyId}`);
      return cached;
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const stats = await this.prisma.message.groupBy({
      by: ['sender', 'storageTier'],
      where: {
        companyId,
        createdAt: { gte: startDate }
      },
      _count: { id: true }
    });

    const result = {
      totalMessages: stats.reduce((sum, stat) => sum + stat._count.id, 0),
      bySender: stats.reduce((acc, stat) => {
        acc[stat.sender] = (acc[stat.sender] || 0) + stat._count.id;
        return acc;
      }, {}),
      byStorageTier: stats.reduce((acc, stat) => {
        acc[stat.storageTier] = (acc[stat.storageTier] || 0) + stat._count.id;
        return acc;
      }, {}),
      period: `${days} days`
    };

    // Armazenar no cache
    this.setCache(cacheKey, result);
    
    return result;
  }

  /**
   * Invalida cache de uma conversa específica
   */
  invalidateConversationCache(conversationId: string) {
    const keysToDelete = Array.from(this.cache.keys())
      .filter(key => key.includes(`messages:${conversationId}`) || key.includes(`conversations:active`));
    
    keysToDelete.forEach(key => this.cache.delete(key));
    
    this.logger.debug(`Invalidated cache for conversation: ${conversationId}`);
  }

  /**
   * Invalida cache de uma empresa
   */
  invalidateCompanyCache(companyId: string) {
    const keysToDelete = Array.from(this.cache.keys())
      .filter(key => key.includes(companyId));
    
    keysToDelete.forEach(key => this.cache.delete(key));
    
    this.logger.debug(`Invalidated cache for company: ${companyId}`);
  }

  /**
   * Limpa cache expirado
   */
  cleanExpiredCache() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, value] of this.cache.entries()) {
      if (value.timestamp && (now - value.timestamp) > this.CACHE_TTL) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Cleaned ${cleaned} expired cache entries`);
    }
  }

  /**
   * Limpa cache quando atinge tamanho máximo
   */
  private enforceMaxCacheSize() {
    if (this.cache.size > this.MAX_CACHE_SIZE) {
      const keysToDelete = Array.from(this.cache.keys()).slice(0, this.cache.size - this.MAX_CACHE_SIZE);
      keysToDelete.forEach(key => this.cache.delete(key));
      
      this.logger.debug(`Cleaned ${keysToDelete.length} cache entries to maintain max size`);
    }
  }

  /**
   * Busca item do cache
   */
  private getFromCache(key: string): any | null {
    const item = this.cache.get(key);
    
    if (!item) {
      return null;
    }

    // Verificar se expirou
    if (item.timestamp && (Date.now() - item.timestamp) > this.CACHE_TTL) {
      this.cache.delete(key);
      return null;
    }

    return item.data;
  }

  /**
   * Armazena item no cache
   */
  private setCache(key: string, data: any) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });

    this.enforceMaxCacheSize();
  }

  /**
   * Obtém estatísticas do cache
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      maxSize: this.MAX_CACHE_SIZE,
      ttl: this.CACHE_TTL
    };
  }

  /**
   * Limpa todo o cache
   */
  clearAllCache() {
    this.cache.clear();
    this.logger.debug('All cache cleared');
  }
}
