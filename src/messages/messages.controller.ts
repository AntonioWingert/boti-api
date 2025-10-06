import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
  Query,
  Request,
} from '@nestjs/common';
import { MessagesService } from './messages.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { ConversationStatus } from '@prisma/client';

@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post('conversations')
  createConversation(@Body() createConversationDto: CreateConversationDto) {
    return this.messagesService.createConversation(createConversationDto);
  }

  @Get('conversations')
  findAllConversations(
    @Query('companyId') companyId?: string,
    @Query('status') status?: ConversationStatus,
  ) {
    return this.messagesService.findAllConversations(companyId, status);
  }

  @Get('conversations/:id')
  findConversationById(@Param('id') id: string) {
    return this.messagesService.findConversationById(id);
  }

  @Post()
  createMessage(@Body() createMessageDto: CreateMessageDto) {
    return this.messagesService.createMessage(createMessageDto);
  }

  @Get('conversations/:conversationId/messages')
  findMessagesByConversation(@Param('conversationId') conversationId: string) {
    return this.messagesService.findMessagesByConversation(conversationId);
  }

  @Patch('conversations/:id/status')
  updateConversationStatus(
    @Param('id') id: string,
    @Body('status') status: ConversationStatus,
  ) {
    return this.messagesService.updateConversationStatus(id, status);
  }

  @Patch('conversations/:id/escalate')
  escalateConversation(
    @Param('id') id: string,
    @Body('userId') userId: string,
  ) {
    return this.messagesService.escalateConversation(id, userId);
  }

  @Patch('conversations/:id/assign')
  assignConversationToUser(
    @Param('id') id: string,
    @Body('userId') userId: string,
  ) {
    return this.messagesService.assignConversationToUser(id, userId);
  }

  @Patch('messages/:id/read')
  markMessageAsRead(@Param('id') id: string) {
    return this.messagesService.markMessageAsRead(id);
  }

  @Patch('messages/:id/sent')
  markMessageAsSent(@Param('id') id: string) {
    return this.messagesService.markMessageAsSent(id);
  }

  @Get('stats')
  getStats(@Query('companyId') companyId?: string, @Request() req?: any) {
    console.log('Messages stats - CompanyId:', companyId, 'User:', req?.user);
    
    // Se não há companyId na query, tentar pegar do usuário autenticado
    const finalCompanyId = companyId || req?.user?.companyId;
    
    if (!finalCompanyId) {
      console.log('No companyId found for messages, returning default stats');
      return {
        total: 0,
        today: 0,
        change: 0
      };
    }
    
    return this.messagesService.getStats(finalCompanyId);
  }

  @Get('recent')
  getRecent(@Query('companyId') companyId?: string, @Query('limit') limit: string = '5', @Request() req?: any) {
    console.log('Messages recent - CompanyId:', companyId, 'User:', req?.user);
    
    // Se não há companyId na query, tentar pegar do usuário autenticado
    const finalCompanyId = companyId || req?.user?.companyId;
    
    if (!finalCompanyId) {
      console.log('No companyId found for recent messages, returning empty array');
      return [];
    }
    
    return this.messagesService.getRecent(finalCompanyId, parseInt(limit));
  }
}
