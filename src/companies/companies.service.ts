import { Injectable, ForbiddenException, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { RegisterCompanyDto } from './dto/register-company.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class CompaniesService {
  constructor(private prisma: PrismaService) {}

  async create(createCompanyDto: CreateCompanyDto) {
    return this.prisma.company.create({
      data: createCompanyDto,
    });
  }

  async findAll() {
    return this.prisma.company.findMany({
      include: {
        users: true,
        chatbots: true,
        whatsappSessions: true,
      },
    });
  }

  async findOne(id: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
        users: true,
        chatbots: true,
        whatsappSessions: true,
        disparos: true,
      },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    return company;
  }

  async update(id: string, updateCompanyDto: UpdateCompanyDto) {
    return this.prisma.company.update({
      where: { id },
      data: updateCompanyDto,
    });
  }

  async remove(id: string) {
    return this.prisma.company.delete({
      where: { id },
    });
  }

  // Sistema de Planos
  async getCurrentPlan(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        planType: true,
        trialStartDate: true,
        trialEndDate: true,
        isTrialActive: true,
        trialUsed: true,
        maxUsers: true,
        maxConnections: true,
        maxChatbots: true,
        maxDisparos: true,
        maxDisparosDiarios: true,
        maxClients: true,
        hasAdvancedAnalytics: true,
        hasCustomBranding: true,
        hasSSO: true,
        hasAPI: true,
        monthlyPrice: true,
        billingCycle: true,
        nextBilling: true,
        isActive: true,
      }
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    // Calcular dias restantes do trial
    let daysLeft = 0;
    if (company.isTrialActive && company.trialEndDate) {
      const now = new Date();
      const endDate = new Date(company.trialEndDate);
      daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    }

    return {
      ...company,
      daysLeft: Math.max(0, daysLeft)
    };
  }

  async getUsage(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        currentUsers: true,
        currentConnections: true,
        currentChatbots: true,
        currentDisparos: true,
        currentDisparosDiarios: true,
        currentClients: true,
        maxUsers: true,
        maxConnections: true,
        maxChatbots: true,
        maxDisparos: true,
        maxDisparosDiarios: true,
        maxClients: true,
        lastDisparoReset: true,
      }
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    // Verificar se precisa resetar contador diário de disparos
    const now = new Date();
    const lastReset = new Date(company.lastDisparoReset);
    const isNewDay = now.getDate() !== lastReset.getDate() || 
                     now.getMonth() !== lastReset.getMonth() || 
                     now.getFullYear() !== lastReset.getFullYear();

    if (isNewDay) {
      await this.prisma.company.update({
        where: { id: companyId },
        data: {
          currentDisparosDiarios: 0,
          lastDisparoReset: now,
        }
      });

      company.currentDisparosDiarios = 0;
    }

    return company;
  }

  async checkResourceLimit(companyId: string, resource: string, quantity: number = 1): Promise<boolean> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        currentUsers: true,
        currentConnections: true,
        currentChatbots: true,
        currentDisparos: true,
        currentDisparosDiarios: true,
        currentClients: true,
        maxUsers: true,
        maxConnections: true,
        maxChatbots: true,
        maxDisparos: true,
        maxDisparosDiarios: true,
        maxClients: true,
        isTrialActive: true,
        trialEndDate: true,
      }
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    // Verificar se trial expirou
    if (company.isTrialActive && company.trialEndDate) {
      const now = new Date();
      const endDate = new Date(company.trialEndDate);
      if (now > endDate) {
        throw new ForbiddenException('Trial expirado. Faça upgrade para continuar.');
      }
    }

    // Verificar limites por recurso
    switch (resource) {
      case 'users':
        return (company.currentUsers + quantity) <= company.maxUsers;
      case 'connections':
        return (company.currentConnections + quantity) <= company.maxConnections;
      case 'chatbots':
        return (company.currentChatbots + quantity) <= company.maxChatbots;
      case 'disparos':
        return (company.currentDisparos + quantity) <= company.maxDisparos;
      case 'disparosDiarios':
        return (company.currentDisparosDiarios + quantity) <= company.maxDisparosDiarios;
      case 'clients':
        return (company.currentClients + quantity) <= company.maxClients;
      default:
        return true;
    }
  }

  async incrementUsage(companyId: string, resource: string, quantity: number = 1) {
    const updateData: any = {};
    updateData[`current${resource.charAt(0).toUpperCase() + resource.slice(1)}`] = { increment: quantity };

    return this.prisma.company.update({
      where: { id: companyId },
      data: updateData,
    });
  }

  async decrementUsage(companyId: string, resource: string, quantity: number = 1) {
    const updateData: any = {};
    updateData[`current${resource.charAt(0).toUpperCase() + resource.slice(1)}`] = { decrement: quantity };

    return this.prisma.company.update({
      where: { id: companyId },
      data: updateData,
    });
  }

  async upgradePlan(companyId: string, planType: string) {
    const planConfigs = {
      STARTER: {
        maxUsers: 3,
        maxConnections: 1,
        maxChatbots: 1,
        maxDisparos: 5000,
        maxDisparosDiarios: 200,
        maxClients: 2000,
        monthlyPrice: 97.00,
        hasAdvancedAnalytics: false,
        hasCustomBranding: false,
        hasSSO: false,
        hasAPI: false,
      },
      PROFESSIONAL: {
        maxUsers: 10,
        maxConnections: 3,
        maxChatbots: 5,
        maxDisparos: 25000,
        maxDisparosDiarios: 1000,
        maxClients: 10000,
        monthlyPrice: 297.00,
        hasAdvancedAnalytics: true,
        hasCustomBranding: true,
        hasSSO: true,
        hasAPI: true,
      },
      ENTERPRISE: {
        maxUsers: 999999,
        maxConnections: 999999,
        maxChatbots: 999999,
        maxDisparos: 999999,
        maxDisparosDiarios: 999999,
        maxClients: 999999,
        monthlyPrice: 997.00,
        hasAdvancedAnalytics: true,
        hasCustomBranding: true,
        hasSSO: true,
        hasAPI: true,
      }
    };

    const config = planConfigs[planType];
    if (!config) {
      throw new NotFoundException('Plano não encontrado');
    }

    return this.prisma.company.update({
      where: { id: companyId },
      data: {
        planType,
        ...config,
        isTrialActive: false,
        nextBilling: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // +30 dias
      },
    });
  }

  async startTrial(companyId: string) {
    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + 7); // +7 dias

    return this.prisma.company.update({
      where: { id: companyId },
      data: {
        planType: 'FREE_TRIAL',
        trialStartDate: new Date(),
        trialEndDate,
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
  }

  async registerCompany(registerCompanyDto: RegisterCompanyDto) {
    const { name, email, phone, address, user, planType = 'FREE_TRIAL', startTrial = true } = registerCompanyDto;

    // Verificar se empresa já existe
    const existingCompany = await this.prisma.company.findUnique({
      where: { email }
    });

    if (existingCompany) {
      throw new ConflictException('Já existe uma empresa cadastrada com este email');
    }

    // Verificar se usuário já existe
    const existingUser = await this.prisma.user.findUnique({
      where: { email: user.email }
    });

    if (existingUser) {
      throw new ConflictException('Já existe um usuário cadastrado com este email');
    }

    try {
      // Hash da senha
      const hashedPassword = await bcrypt.hash(user.password, 10);

      // Configurações do plano
      const planConfigs = {
        FREE_TRIAL: {
          maxUsers: 2,
          maxConnections: 1,
          maxChatbots: 1,
          maxDisparos: 5000,
          maxDisparosDiarios: 200,
          maxClients: 2000,
          monthlyPrice: 0.00,
          hasAdvancedAnalytics: false,
          hasCustomBranding: false,
          hasSSO: false,
          hasAPI: false,
        },
        FREE: {
          maxUsers: 1,
          maxConnections: 1,
          maxChatbots: 1,
          maxDisparos: 1000,
          maxDisparosDiarios: 50,
          maxClients: 500,
          monthlyPrice: 0.00,
          hasAdvancedAnalytics: false,
          hasCustomBranding: false,
          hasSSO: false,
          hasAPI: false,
        },
        STARTER: {
          maxUsers: 3,
          maxConnections: 1,
          maxChatbots: 1,
          maxDisparos: 5000,
          maxDisparosDiarios: 200,
          maxClients: 2000,
          monthlyPrice: 97.00,
          hasAdvancedAnalytics: false,
          hasCustomBranding: false,
          hasSSO: false,
          hasAPI: false,
        }
      };

      const config = planConfigs[planType];
      if (!config) {
        throw new BadRequestException('Tipo de plano inválido');
      }

      // Criar empresa e usuário em uma transação
      const result = await this.prisma.$transaction(async (tx) => {
        // Criar empresa
        const company = await tx.company.create({
          data: {
            name,
            email,
            phone,
            address,
            active: false, // Inativa até aprovação do admin
            planType,
            trialStartDate: startTrial && planType === 'FREE_TRIAL' ? new Date() : null,
            trialEndDate: startTrial && planType === 'FREE_TRIAL' ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : null,
            isTrialActive: startTrial && planType === 'FREE_TRIAL',
            trialUsed: startTrial && planType === 'FREE_TRIAL',
            ...config,
            currentUsers: 0,
            currentConnections: 0,
            currentChatbots: 0,
            currentDisparos: 0,
            currentDisparosDiarios: 0,
            currentClients: 0,
            lastDisparoReset: new Date(),
            billingCycle: 'MONTHLY',
            nextBilling: planType !== 'FREE' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null,
            isActive: true,
          }
        });

        // Criar usuário administrador
        const adminUser = await tx.user.create({
          data: {
            name: user.name,
            email: user.email,
            password: hashedPassword,
            role: 'ADMIN',
            active: true,
            companyId: company.id,
          }
        });

        // Atualizar contador de usuários
        await tx.company.update({
          where: { id: company.id },
          data: { currentUsers: 1 }
        });

        return { company, user: adminUser };
      });

      return {
        success: true,
        message: 'Empresa registrada com sucesso. Aguardando aprovação do administrador.',
        data: {
          company: {
            id: result.company.id,
            name: result.company.name,
            email: result.company.email,
            phone: result.company.phone,
            address: result.company.address,
            planType: result.company.planType,
            active: result.company.active,
            createdAt: result.company.createdAt
          },
          user: {
            id: result.user.id,
            name: result.user.name,
            email: result.user.email,
            role: result.user.role,
            active: result.user.active
          }
        }
      };

    } catch (error) {
      if (error instanceof ConflictException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Erro ao registrar empresa: ' + error.message);
    }
  }
}