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
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { JwtAuthGuard } from '../users/jwt-auth.guard';

@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() createClientDto: CreateClientDto, @Request() req) {
    // Garantir que o client é criado para a empresa do usuário
    const userCompanyId = req.user.companyId;
    return this.clientsService.create({
      ...createClientDto,
      companyId: userCompanyId
    });
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(@Request() req) {
    // Usuários só podem ver clientes da própria empresa
    const userCompanyId = req.user.companyId;
    return this.clientsService.findAll(userCompanyId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id') id: string, @Request() req) {
    const userCompanyId = req.user.companyId;
    return this.clientsService.findOneForCompany(id, userCompanyId);
  }

  @Get('phone/:phone')
  @UseGuards(JwtAuthGuard)
  async findByPhone(@Param('phone') phone: string, @Request() req) {
    const userCompanyId = req.user.companyId;
    return this.clientsService.findByPhoneForCompany(phone, userCompanyId);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(@Param('id') id: string, @Body() updateClientDto: UpdateClientDto, @Request() req) {
    const userCompanyId = req.user.companyId;
    return this.clientsService.updateForCompany(id, updateClientDto, userCompanyId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @Request() req) {
    const userCompanyId = req.user.companyId;
    return this.clientsService.removeForCompany(id, userCompanyId);
  }

  @Patch(':id/toggle-status')
  @UseGuards(JwtAuthGuard)
  async toggleStatus(@Param('id') id: string, @Request() req) {
    const userCompanyId = req.user.companyId;
    return this.clientsService.toggleStatusForCompany(id, userCompanyId);
  }

  @Get('stats')
  async getStats(@Request() req) {
    console.log('Cliente stats - User:', req.user);
    
    // Se não há usuário autenticado, retornar dados padrão
    if (!req.user || !req.user.companyId) {
      console.log('No user or companyId found, returning default stats');
      return {
        total: 0,
        new: 0,
        change: 0
      };
    }
    
    return this.clientsService.getStats(req.user.companyId);
  }
}