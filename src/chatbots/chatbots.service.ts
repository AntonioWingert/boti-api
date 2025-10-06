import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateChatbotDto } from './dto/create-chatbot.dto';
import { UpdateChatbotDto } from './dto/update-chatbot.dto';

@Injectable()
export class ChatbotsService {
  constructor(private prisma: PrismaService) {}

  async create(createChatbotDto: CreateChatbotDto) {
    // Verify if company exists
    const company = await this.prisma.company.findUnique({
      where: { id: createChatbotDto.companyId },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    return this.prisma.chatbot.create({
      data: createChatbotDto,
      include: {
        company: true,
      },
    });
  }

  async findAll(companyId?: string) {
    const where = companyId ? { companyId } : {};
    
    return this.prisma.chatbot.findMany({
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
    const chatbot = await this.prisma.chatbot.findUnique({
      where: { id },
      include: {
        company: true,
        conversations: {
          include: {
            client: true,
          },
        },
      },
    });

    if (!chatbot) {
      throw new NotFoundException('Chatbot not found');
    }

    return chatbot;
  }

  async update(id: string, updateChatbotDto: UpdateChatbotDto) {
    // Verify if chatbot exists
    await this.findOne(id);

    return this.prisma.chatbot.update({
      where: { id },
      data: updateChatbotDto,
      include: {
        company: true,
      },
    });
  }

  async remove(id: string) {
    // Verify if chatbot exists
    await this.findOne(id);

    return this.prisma.chatbot.delete({
      where: { id },
    });
  }

  async toggleStatus(id: string) {
    const chatbot = await this.findOne(id);
    
    return this.prisma.chatbot.update({
      where: { id },
      data: { active: !chatbot.active },
    });
  }

  async getActiveChatbotByCompany(companyId: string) {
    return this.prisma.chatbot.findFirst({
      where: {
        companyId,
        active: true,
      },
      include: {
        company: true,
      },
    });
  }

  async getStats(companyId?: string) {
    try {
      const where = companyId ? { companyId } : {};
      
      const [total, active] = await Promise.all([
        this.prisma.chatbot.count({ where }),
        this.prisma.chatbot.count({ 
          where: { ...where, active: true }
        })
      ]);

      const change = total > 0 ? 
        Math.round(((active / total) * 100) - 50) : 0;

      return {
        total,
        active,
        change
      };
    } catch (error) {
      // Retornar dados padrão em caso de erro
      return {
        total: 0,
        active: 0,
        change: 0
      };
    }
  }
}
