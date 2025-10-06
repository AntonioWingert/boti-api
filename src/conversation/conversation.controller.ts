import { Controller, Get, Post, Put, Delete, Body, Param, Query, Logger, UseGuards, Request } from '@nestjs/common';
import { ConversationMonitorService } from './conversation-monitor.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../users/jwt-auth.guard';

@Controller('conversations')
export class ConversationController {
  private readonly logger = new Logger(ConversationController.name);

  constructor(
    private readonly monitorService: ConversationMonitorService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Buscar conversas com filtros
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  async getConversations(
    @Request() req,
    @Query('status') status?: string,
    @Query('companyId') companyId?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10'
  ) {
    try {
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;

      // Usuários só podem ver conversas da própria empresa
      const userCompanyId = req.user.companyId;
      const where: any = { companyId: userCompanyId };
      if (status) where.status = status;

      const [conversations, total] = await Promise.all([
        this.prisma.conversation.findMany({
          where,
          include: {
            client: true,
            chatbot: true,
            user: true
          },
          orderBy: { updatedAt: 'desc' },
          skip,
          take: limitNum
        }),
        this.prisma.conversation.count({ where })
      ]);

      return {
        conversations,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      };
    } catch (error) {
      this.logger.error('Error fetching conversations:', error);
      throw error;
    }
  }

  /**
   * Buscar conversa específica
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getConversation(@Param('id') id: string, @Request() req) {
    try {
      const userCompanyId = req.user.companyId;
      const conversation = await this.prisma.conversation.findFirst({
        where: { 
          id,
          companyId: userCompanyId // Garantir que a conversa pertence à empresa do usuário
        },
        include: {
          client: true,
          chatbot: true,
          user: true,
          currentFlow: {
            include: {
              nodes: {
                include: {
                  options: true
                }
              }
            }
          }
        }
      });

      if (!conversation) {
        throw new Error('Conversation not found');
      }

      return conversation;
    } catch (error) {
      this.logger.error(`Error fetching conversation ${id}:`, error);
      throw error;
    }
  }

  /**
   * Encerrar conversa manualmente
   */
  @Post(':id/close')
  @UseGuards(JwtAuthGuard)
  async closeConversation(
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @Request() req
  ) {
    try {
      await this.monitorService.closeConversationManually(id, body.reason);
      return { success: true, message: 'Conversation closed successfully' };
    } catch (error) {
      this.logger.error(`Error closing conversation ${id}:`, error);
      throw error;
    }
  }

  /**
   * Reativar conversa
   */
  @Post(':id/reactivate')
  @UseGuards(JwtAuthGuard)
  async reactivateConversation(@Param('id') id: string, @Request() req) {
    try {
      const conversation = await this.prisma.conversation.findUnique({
        where: { id }
      });

      if (!conversation) {
        throw new Error('Conversation not found');
      }

      if (conversation.status !== 'FINISHED') {
        throw new Error('Conversation is not finished');
      }

      await this.prisma.conversation.update({
        where: { id },
        data: {
          status: 'ACTIVE',
          finishedAt: null,
          updatedAt: new Date()
        }
      });

      this.logger.log(`Conversation ${id} reactivated`);
      return { success: true, message: 'Conversation reactivated successfully' };
    } catch (error) {
      this.logger.error(`Error reactivating conversation ${id}:`, error);
      throw error;
    }
  }

  /**
   * Estatísticas de conversas
   */
  @Get('stats/overview')
  async getStats() {
    try {
      return await this.monitorService.getConversationStats();
    } catch (error) {
      this.logger.error('Error fetching conversation stats:', error);
      throw error;
    }
  }

  /**
   * Forçar verificação de conversas inativas (para testes)
   */
  @Post('check-inactive')
  async checkInactiveConversations() {
    try {
      await this.monitorService.checkInactiveConversations();
      return { success: true, message: 'Inactive conversations check completed' };
    } catch (error) {
      this.logger.error('Error checking inactive conversations:', error);
      throw error;
    }
  }

  /**
   * Deletar conversa (apenas para admin)
   */
  @Delete(':id')
  async deleteConversation(@Param('id') id: string) {
    try {
      await this.prisma.conversation.delete({
        where: { id }
      });

      this.logger.log(`Conversation ${id} deleted`);
      return { success: true, message: 'Conversation deleted successfully' };
    } catch (error) {
      this.logger.error(`Error deleting conversation ${id}:`, error);
      throw error;
    }
  }
}

