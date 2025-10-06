import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Request,
  Put,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AdminGuard } from './admin.guard';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('register')
  register(@Body() createUserDto: CreateUserDto) {
    // Redirecionar para o sistema de solicitação pendente
    return this.usersService.createPendingUser(createUserDto);
  }

  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.usersService.login(loginDto);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  getProfile(@Request() req) {
    return this.usersService.getProfile(req.user.id);
  }

  // ===== ADMIN ENDPOINTS =====

  /**
   * Listar todos os usuários (apenas admin)
   */
  @Get('admin/all')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getAllUsers() {
    return this.usersService.findAll();
  }

  /**
   * Criar usuário (apenas admin)
   */
  @Post('admin/create')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async createUser(@Body() createUserDto: CreateUserDto) {
    console.log('🔍 Backend received payload:', JSON.stringify(createUserDto, null, 2));
    console.log('🔍 Payload keys:', Object.keys(createUserDto));
    console.log('🔍 Has active property?', 'active' in createUserDto);
    
    try {
      const result = await this.usersService.register(createUserDto);
      console.log('✅ User created successfully');
      return result;
    } catch (error) {
      console.error('❌ Error creating user:', error);
      throw error;
    }
  }

  /**
   * Atualizar usuário (apenas admin)
   */
  @Put('admin/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async updateUser(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  /**
   * Deletar usuário (apenas admin)
   */
  @Delete('admin/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteUser(@Param('id') id: string) {
    return this.usersService.remove(id);
  }

  /**
   * Ativar/Desativar usuário (apenas admin)
   */
  @Put('admin/:id/toggle-status')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async toggleUserStatus(@Param('id') id: string) {
    return this.usersService.toggleStatus(id);
  }

  /**
   * Gerar token de teste (sem autenticação)
   */
  @Post('generate-test-token')
  async generateTestToken() {
    try {
      // Buscar ou criar usuário de teste
      let testUser = await this.usersService.findByEmail('test@example.com');
      
      if (!testUser) {
        // Criar usuário de teste
        await this.usersService.register({
          name: 'Test User',
          email: 'test@example.com',
          password: 'test123',
          companyId: 'default-company'
        });
        
        // Buscar o usuário criado
        testUser = await this.usersService.findByEmail('test@example.com');
      }

      if (!testUser) {
        throw new Error('Failed to create or find test user');
      }

      // Gerar token
      const token = await this.usersService.generateToken(testUser);
      
      return {
        success: true,
        token: token,
        user: {
          id: testUser.id,
          name: testUser.name,
          email: testUser.email
        },
        message: 'Test token generated successfully',
        instructions: [
          '1. Copy the token above',
          '2. In Insomnia, go to Auth tab',
          '3. Select "Bearer Token"',
          '4. Paste the token in the Token field',
          '5. Now you can use protected routes'
        ]
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Failed to generate test token'
      };
    }
  }
}
