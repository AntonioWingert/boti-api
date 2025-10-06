import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService, NotificationFilters } from './notifications.service';
import { JwtAuthGuard } from '../users/jwt-auth.guard';
import { AdminGuard } from '../users/admin.guard';

@ApiTags('notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar notificações do usuário' })
  @ApiResponse({ status: 200, description: 'Lista de notificações' })
  async getNotifications(
    @Request() req: any,
    @Query('type') type?: string,
    @Query('read') read?: string,
    @Query('priority') priority?: string,
    @Query('targetRole') targetRole?: string,
  ) {
    const filters: NotificationFilters = {
      userId: req.user.sub,
      type,
      read: read === 'true' ? true : read === 'false' ? false : undefined,
      priority,
      targetRole,
    };

    return this.notificationsService.getNotifications(filters);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Contar notificações não lidas' })
  @ApiResponse({ status: 200, description: 'Número de notificações não lidas' })
  async getUnreadCount(@Request() req: any) {
    return this.notificationsService.getUnreadCount(req.user.sub);
  }

  @Put(':id/read')
  @ApiOperation({ summary: 'Marcar notificação como lida' })
  @ApiResponse({ status: 200, description: 'Notificação marcada como lida' })
  async markAsRead(@Param('id') id: string, @Request() req: any) {
    return this.notificationsService.markAsRead(id, req.user.sub);
  }

  @Put('mark-all-read')
  @ApiOperation({ summary: 'Marcar todas as notificações como lidas' })
  @ApiResponse({ status: 200, description: 'Todas as notificações marcadas como lidas' })
  async markAllAsRead(@Request() req: any) {
    return this.notificationsService.markAllAsRead(req.user.sub);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Excluir notificação' })
  @ApiResponse({ status: 200, description: 'Notificação excluída' })
  async deleteNotification(@Param('id') id: string, @Request() req: any) {
    return this.notificationsService.deleteNotification(id, req.user.sub);
  }

  @Get('admin')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Listar todas as notificações (Admin)' })
  @ApiResponse({ status: 200, description: 'Lista de todas as notificações' })
  async getAllNotifications(
    @Query('type') type?: string,
    @Query('read') read?: string,
    @Query('priority') priority?: string,
    @Query('targetRole') targetRole?: string,
    @Query('companyId') companyId?: string,
  ) {
    const filters: NotificationFilters = {
      type,
      read: read === 'true' ? true : read === 'false' ? false : undefined,
      priority,
      targetRole,
      companyId,
    };

    return this.notificationsService.getNotifications(filters);
  }
}
