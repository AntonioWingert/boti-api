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
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../users/jwt-auth.guard';
import { ChatbotsService } from './chatbots.service';
import { CreateChatbotDto } from './dto/create-chatbot.dto';
import { UpdateChatbotDto } from './dto/update-chatbot.dto';

@Controller('chatbots')
export class ChatbotsController {
  constructor(private readonly chatbotsService: ChatbotsService) {}

  @Post()
  create(@Body() createChatbotDto: CreateChatbotDto) {
    return this.chatbotsService.create(createChatbotDto);
  }

  @Get()
  findAll(@Query('companyId') companyId?: string) {
    return this.chatbotsService.findAll(companyId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.chatbotsService.findOne(id);
  }

  @Get('company/:companyId/active')
  getActiveChatbotByCompany(@Param('companyId') companyId: string) {
    return this.chatbotsService.getActiveChatbotByCompany(companyId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateChatbotDto: UpdateChatbotDto) {
    return this.chatbotsService.update(id, updateChatbotDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.chatbotsService.remove(id);
  }

  @Patch(':id/toggle-status')
  toggleStatus(@Param('id') id: string) {
    return this.chatbotsService.toggleStatus(id);
  }

  @Get('stats')
  getStats(@Query('companyId') companyId?: string, @Request() req?: any) {
    console.log('Chatbot stats - CompanyId:', companyId, 'User:', req?.user);
    
    // Se não há companyId na query, tentar pegar do usuário autenticado
    const finalCompanyId = companyId || req?.user?.companyId;
    
    if (!finalCompanyId) {
      console.log('No companyId found, returning default stats');
      return {
        total: 0,
        active: 0,
        change: 0
      };
    }
    
    return this.chatbotsService.getStats(finalCompanyId);
  }
}
