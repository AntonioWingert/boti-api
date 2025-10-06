import { Controller, Post, Body, HttpCode, HttpStatus, Get, UseFilters } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CompaniesService } from '../companies/companies.service';
import { RegisterCompanyDto } from '../companies/dto/register-company.dto';
import { RegisterCompanyFlatDto } from '../companies/dto/register-company-flat.dto';
import { PendingUsersService } from '../admin/pending-users.service';
import { CreatePendingUserDto } from '../admin/dto/create-pending-user.dto';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { ValidationFailedException } from '../common/exceptions/business.exceptions';

@ApiTags('auth')
@Controller('auth')
@UseFilters(HttpExceptionFilter)
export class AuthController {
  constructor(
    private readonly companiesService: CompaniesService,
    private readonly pendingUsersService: PendingUsersService
  ) {}

  @Get('test')
  @ApiOperation({ summary: 'Teste de conectividade' })
  test() {
    return {
      success: true,
      message: 'Auth module is working!',
      timestamp: new Date().toISOString()
    };
  }

  @Get('test-error')
  @ApiOperation({ summary: 'Teste de tratamento de erros' })
  testError() {
    throw new Error('Este é um teste de erro para verificar o tratamento');
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ 
    summary: 'Solicitar registro de nova empresa',
    description: 'Endpoint público para solicitar registro de nova empresa. Cria uma solicitação pendente que precisa ser aprovada pelo administrador.'
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Solicitação de registro enviada com sucesso',
    schema: {
      example: {
        success: true,
        message: 'Solicitação de registro enviada com sucesso. Aguardando aprovação do administrador.',
        data: {
          id: 'pending_user_id',
          name: 'João Silva',
          email: 'joao@empresa.com',
          companyName: 'Empresa ABC',
          companyEmail: 'contato@empresa.com',
          status: 'PENDING',
          createdAt: '2024-01-01T00:00:00.000Z'
        }
      }
    }
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Dados inválidos fornecidos',
    schema: {
      example: {
        success: false,
        error: {
          statusCode: 400,
          message: 'Dados inválidos fornecidos',
          details: {
            errors: [
              {
                field: 'email',
                value: 'email-invalido',
                message: { isEmail: 'email must be an email' },
                suggestion: 'Use um formato de email válido (ex: usuario@empresa.com)'
              }
            ]
          },
          timestamp: '2024-01-01T00:00:00.000Z',
          path: '/auth/register'
        }
      }
    }
  })
  @ApiResponse({ 
    status: 409, 
    description: 'Conflito - Email já existe',
    schema: {
      example: {
        success: false,
        error: {
          statusCode: 409,
          message: 'Este email já está sendo usado',
          details: {
            field: 'email',
            value: 'usuario@empresa.com',
            suggestion: 'Use um email diferente ou faça login se já possui uma conta'
          },
          timestamp: '2024-01-01T00:00:00.000Z',
          path: '/auth/register'
        }
      }
    }
  })
  @ApiResponse({ 
    status: 500, 
    description: 'Erro interno do servidor' 
  })
  async register(@Body() registerCompanyFlatDto: RegisterCompanyFlatDto) {
    try {
      // Criar solicitação pendente em vez de empresa diretamente
      const pendingUserDto: CreatePendingUserDto = {
        name: registerCompanyFlatDto.name,
        email: registerCompanyFlatDto.email,
        password: registerCompanyFlatDto.password,
        companyName: registerCompanyFlatDto.companyName,
        companyEmail: registerCompanyFlatDto.companyEmail,
        companyPhone: registerCompanyFlatDto.companyPhone,
        companyAddress: registerCompanyFlatDto.companyAddress,
        message: registerCompanyFlatDto.message,
      };

      const pendingUser = await this.pendingUsersService.create(pendingUserDto);

      return {
        success: true,
        message: 'Solicitação de registro enviada com sucesso. Aguardando aprovação do administrador.',
        data: {
          id: pendingUser.id,
          name: pendingUser.name,
          email: pendingUser.email,
          companyName: pendingUser.companyName,
          companyEmail: pendingUser.companyEmail,
          status: pendingUser.status,
          createdAt: pendingUser.createdAt
        }
      };
    } catch (error) {
      // Log do erro para debug
      console.error('Erro no registro:', error);
      
      // Re-throw para que o filtro global trate
      throw error;
    }
  }
}
