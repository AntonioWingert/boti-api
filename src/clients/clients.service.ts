import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@Injectable()
export class ClientsService {
  constructor(private prisma: PrismaService) {}

  async create(createClientDto: CreateClientDto) {
    // Check if company exists
    const company = await this.prisma.company.findUnique({
      where: { id: createClientDto.companyId },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    // Check if client already exists with the same phone
    const existingClient = await this.prisma.client.findUnique({
      where: { phone: createClientDto.phone },
    });

    if (existingClient) {
      throw new ConflictException('Client already exists with this phone');
    }

    return this.prisma.client.create({
      data: createClientDto,
      include: {
        company: true,
      },
    });
  }

  async findAll(companyId?: string) {
    const where = companyId ? { companyId } : {};
    
    return this.prisma.client.findMany({
      where,
      include: {
        company: true,
        _count: {
          select: {
            conversations: true,
          },
        },
      },
    });
  }

  async findOne(id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: {
        company: true,
        conversations: {
          include: {
            chatbot: true,
            user: true,
          },
        },
      },
    });

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    return client;
  }

  async update(id: string, updateClientDto: UpdateClientDto) {
    // Check if client exists
    const client = await this.findOne(id);

    // If updating phone, check if already exists
    if (updateClientDto.phone) {
      const existingClient = await this.prisma.client.findFirst({
        where: {
          AND: [
            { id: { not: id } },
            { phone: updateClientDto.phone },
          ],
        },
      });

      if (existingClient) {
        throw new ConflictException('Client already exists with this phone');
      }
    }

    return this.prisma.client.update({
      where: { id },
      data: updateClientDto,
      include: {
        company: true,
      },
    });
  }

  async remove(id: string) {
    // Check if client exists
    await this.findOne(id);

    return this.prisma.client.delete({
      where: { id },
    });
  }

  async toggleStatus(id: string) {
    const client = await this.findOne(id);
    
    return this.prisma.client.update({
      where: { id },
      data: { active: !client.active },
    });
  }

  async findByPhone(phone: string) {
    return this.prisma.client.findUnique({
      where: { phone },
      include: {
        company: true,
      },
    });
  }

  // ===== MÉTODOS SEGUROS POR EMPRESA =====

  async findOneForCompany(id: string, companyId: string) {
    const client = await this.prisma.client.findFirst({
      where: { 
        id,
        companyId // Garantir que o cliente pertence à empresa
      },
      include: {
        company: true,
        conversations: {
          include: {
            chatbot: true,
            user: true,
          },
        },
      },
    });

    if (!client) {
      throw new NotFoundException('Client not found or access denied');
    }

    return client;
  }

  async findByPhoneForCompany(phone: string, companyId: string) {
    const client = await this.prisma.client.findFirst({
      where: { 
        phone,
        companyId // Garantir que o cliente pertence à empresa
      },
      include: {
        company: true,
      },
    });

    if (!client) {
      throw new NotFoundException('Client not found or access denied');
    }

    return client;
  }

  async updateForCompany(id: string, updateClientDto: UpdateClientDto, companyId: string) {
    // Verificar se o cliente pertence à empresa
    await this.findOneForCompany(id, companyId);

    // If updating phone, check if already exists
    if (updateClientDto.phone) {
      const existingClient = await this.prisma.client.findFirst({
        where: {
          AND: [
            { id: { not: id } },
            { phone: updateClientDto.phone },
          ],
        },
      });

      if (existingClient) {
        throw new ConflictException('Client already exists with this phone');
      }
    }

    return this.prisma.client.update({
      where: { id },
      data: updateClientDto,
      include: {
        company: true,
      },
    });
  }

  async removeForCompany(id: string, companyId: string) {
    // Verificar se o cliente pertence à empresa
    await this.findOneForCompany(id, companyId);

    return this.prisma.client.delete({
      where: { id },
    });
  }

  async toggleStatusForCompany(id: string, companyId: string) {
    // Verificar se o cliente pertence à empresa
    const client = await this.findOneForCompany(id, companyId);
    
    return this.prisma.client.update({
      where: { id },
      data: { active: !client.active },
    });
  }

  async getStats(companyId: string) {
    try {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

      const [total, newToday, newThisMonth, newLastMonth] = await Promise.all([
        this.prisma.client.count({
          where: { companyId }
        }),
        this.prisma.client.count({
          where: { 
            companyId,
            createdAt: { gte: startOfDay }
          }
        }),
        this.prisma.client.count({
          where: { 
            companyId,
            createdAt: { gte: startOfMonth }
          }
        }),
        this.prisma.client.count({
          where: { 
            companyId,
            createdAt: { 
              gte: startOfLastMonth,
              lte: endOfLastMonth
            }
          }
        })
      ]);

      const change = newLastMonth > 0 ? 
        Math.round(((newThisMonth / newLastMonth) * 100) - 100) : 0;

      return {
        total,
        new: newToday,
        change
      };
    } catch (error) {
      // Retornar dados padrão em caso de erro
      return {
        total: 0,
        new: 0,
        change: 0
      };
    }
  }
}