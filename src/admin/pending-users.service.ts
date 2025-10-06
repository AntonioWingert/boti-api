import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePendingUserDto } from './dto/create-pending-user.dto';
import { 
  EmailAlreadyExistsException, 
  PendingRequestExistsException,
  RequestAlreadyProcessedException 
} from '../common/exceptions/business.exceptions';
import * as bcrypt from 'bcrypt';

@Injectable()
export class PendingUsersService {
  constructor(private prisma: PrismaService) {}

  async create(createPendingUserDto: CreatePendingUserDto) {
    // Verificar se email já existe
    const existingUser = await this.prisma.user.findUnique({
      where: { email: createPendingUserDto.email }
    });

    if (existingUser) {
      throw new EmailAlreadyExistsException(createPendingUserDto.email);
    }

    // Verificar se já existe solicitação pendente
    const existingPending = await this.prisma.pendingUser.findUnique({
      where: { email: createPendingUserDto.email }
    });

    if (existingPending) {
      throw new PendingRequestExistsException(createPendingUserDto.email);
    }

    // Hash da senha
    const hashedPassword = await bcrypt.hash(createPendingUserDto.password, 10);

    return this.prisma.pendingUser.create({
      data: {
        ...createPendingUserDto,
        password: hashedPassword,
      },
    });
  }

  async findAll() {
    return this.prisma.pendingUser.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const pendingUser = await this.prisma.pendingUser.findUnique({
      where: { id },
    });

    if (!pendingUser) {
      throw new NotFoundException('Solicitação não encontrada');
    }

    return pendingUser;
  }

  async approve(id: string) {
    const pendingUser = await this.findOne(id);

    if (pendingUser.status !== 'PENDING') {
      throw new RequestAlreadyProcessedException(id, pendingUser.status);
    }

    // Criar empresa
    const company = await this.prisma.company.create({
      data: {
        name: pendingUser.companyName,
        email: pendingUser.companyEmail,
        phone: pendingUser.companyPhone,
        address: pendingUser.companyAddress,
        planType: 'FREE_TRIAL',
        trialStartDate: new Date(),
        trialEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // +7 dias
        isTrialActive: true,
        trialUsed: true,
        maxUsers: 2,
        maxConnections: 1,
        maxChatbots: 1,
        maxDisparos: 5000,
        maxDisparosDiarios: 200,
        maxClients: 2000,
        monthlyPrice: 0.00,
      },
    });

    // Criar usuário SUPERVISOR
    const supervisor = await this.prisma.user.create({
      data: {
        name: pendingUser.name,
        email: pendingUser.email,
        password: pendingUser.password,
        role: 'SUPERVISOR',
        companyId: company.id,
      },
    });

    // Criar usuário AGENT padrão
    const agent = await this.prisma.user.create({
      data: {
        name: 'Agente de Atendimento',
        email: `agent-${company.id}@trial.com`,
        password: await bcrypt.hash('agent123', 10),
        role: 'AGENT',
        companyId: company.id,
      },
    });

    // Atualizar contadores da empresa
    await this.prisma.company.update({
      where: { id: company.id },
      data: {
        currentUsers: 2,
        currentConnections: 0,
        currentChatbots: 0,
        currentDisparos: 0,
        currentDisparosDiarios: 0,
        currentClients: 0,
      },
    });

    // Atualizar status da solicitação
    await this.prisma.pendingUser.update({
      where: { id },
      data: { status: 'APPROVED' },
    });

    return {
      company,
      supervisor,
      agent,
      message: 'Usuário aprovado com sucesso! Trial de 7 dias iniciado.',
    };
  }

  async reject(id: string) {
    const pendingUser = await this.findOne(id);

    if (pendingUser.status !== 'PENDING') {
      throw new RequestAlreadyProcessedException(id, pendingUser.status);
    }

    return this.prisma.pendingUser.update({
      where: { id },
      data: { status: 'REJECTED' },
    });
  }

  async remove(id: string) {
    const pendingUser = await this.findOne(id);
    
    return this.prisma.pendingUser.delete({
      where: { id },
    });
  }
}
