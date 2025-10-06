import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { RegisterCompanyDto } from './dto/register-company.dto';
import { JwtAuthGuard } from '../users/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('companies')
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post()
  create(@Body() createCompanyDto: CreateCompanyDto) {
    return this.companiesService.create(createCompanyDto);
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ 
    summary: 'Registrar nova empresa',
    description: 'Cria uma nova empresa com usuário administrador. Requer aprovação de admin.'
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Empresa registrada com sucesso',
    schema: {
      example: {
        success: true,
        message: 'Empresa registrada com sucesso. Aguardando aprovação do administrador.',
        data: {
          company: {
            id: 'company_id',
            name: 'Empresa ABC',
            email: 'contato@empresa.com',
            status: 'PENDING_APPROVAL'
          },
          user: {
            id: 'user_id',
            name: 'João Silva',
            email: 'joao@empresa.com',
            role: 'ADMIN'
          }
        }
      }
    }
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Dados inválidos ou empresa já existe' 
  })
  @ApiResponse({ 
    status: 500, 
    description: 'Erro interno do servidor' 
  })
  async register(@Body() registerCompanyDto: RegisterCompanyDto) {
    return this.companiesService.registerCompany(registerCompanyDto);
  }

  @Get()
  findAll() {
    return this.companiesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.companiesService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateCompanyDto: UpdateCompanyDto) {
    return this.companiesService.update(id, updateCompanyDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.companiesService.remove(id);
  }

  // Endpoints para sistema de planos
  @Get('current-plan')
  @UseGuards(JwtAuthGuard)
  getCurrentPlan(@Request() req) {
    return this.companiesService.getCurrentPlan(req.user.companyId);
  }

  @Get('usage')
  @UseGuards(JwtAuthGuard)
  getUsage(@Request() req) {
    return this.companiesService.getUsage(req.user.companyId);
  }

  @Post('upgrade')
  @UseGuards(JwtAuthGuard)
  upgradePlan(@Request() req, @Body() body: { planType: string }) {
    return this.companiesService.upgradePlan(req.user.companyId, body.planType);
  }

  @Post('start-trial')
  @UseGuards(JwtAuthGuard)
  startTrial(@Request() req) {
    return this.companiesService.startTrial(req.user.companyId);
  }

  @Post('check-limits')
  @UseGuards(JwtAuthGuard)
  checkLimits(@Request() req, @Body() body: { resource: string; quantity?: number }) {
    return this.companiesService.checkResourceLimit(
      req.user.companyId, 
      body.resource, 
      body.quantity || 1
    );
  }
}