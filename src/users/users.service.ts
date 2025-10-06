import { Injectable, UnauthorizedException, ConflictException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async createPendingUser(createUserDto: CreateUserDto) {
    // Criar solicitação pendente em vez de usuário direto
    const { companyId, ...userData } = createUserDto;
    
    return this.prisma.pendingUser.create({
      data: {
        name: userData.name,
        email: userData.email,
        password: await bcrypt.hash(userData.password, 10),
        companyName: 'Empresa Pendente', // Será preenchido pelo frontend
        companyEmail: userData.email,
        message: 'Solicitação via endpoint antigo',
      },
    });
  }

  async register(createUserDto: CreateUserDto) {
    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: createUserDto.email },
    });

    if (existingUser) {
      throw new ConflictException('User already exists with this email');
    }

    // Check if company exists
    const company = await this.prisma.company.findUnique({
      where: { id: createUserDto.companyId },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        ...createUserDto,
        password: hashedPassword,
      },
      include: {
        company: true,
      },
    });

    // Remove password from response
    const { password, ...result } = user;
    return result;
  }

  async login(loginDto: LoginDto) {
    // Find user
    const user = await this.prisma.user.findUnique({
      where: { email: loginDto.email },
      include: {
        company: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if user is active
    if (!user.active) {
      throw new UnauthorizedException('User account is disabled');
    }

    // Check if company is active
    if (!user.company.active) {
      throw new UnauthorizedException('Company account is disabled');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Generate JWT token
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
    };

    const token = this.jwtService.sign(payload);

    // Remove password from response
    const { password, ...userWithoutPassword } = user;

    return {
      access_token: token,
      user: userWithoutPassword,
    };
  }

  async validateUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        company: true,
      },
    });

    if (!user || !user.active || !user.company.active) {
      return null;
    }

    // Remove password from response
    const { password, ...result } = user;
    return result;
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        company: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Remove password from response
    const { password, ...result } = user;
    return result;
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: {
        company: true,
      },
    });
  }

  async generateToken(user: any) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
    };

    return this.jwtService.sign(payload);
  }

  // ===== ADMIN METHODS =====

  async findAll() {
    return this.prisma.user.findMany({
      include: { company: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { company: true },
    });
  }

  async update(id: string, updateUserDto: any) {
    const { password, ...updateData } = updateUserDto;
    
    const updatePayload: any = { ...updateData };
    
    if (password) {
      updatePayload.password = await bcrypt.hash(password, 10);
    }

    return this.prisma.user.update({
      where: { id },
      data: updatePayload,
      include: { company: true },
    });
  }

  async remove(id: string) {
    return this.prisma.user.delete({
      where: { id },
    });
  }

  async toggleStatus(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.prisma.user.update({
      where: { id },
      data: { active: !user.active },
      include: { company: true },
    });
  }
}
