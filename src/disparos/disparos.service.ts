import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDisparoDto } from './dto/create-disparo.dto';
import { UpdateDisparoDto } from './dto/update-disparo.dto';

@Injectable()
export class DisparosService {
  constructor(private prisma: PrismaService) {}

  async create(createDisparoDto: CreateDisparoDto, companyId: string) {
    // Verificar limites antes de criar
    const canCreate = await this.checkDisparoLimits(companyId, createDisparoDto.recipients?.length || 0);
    if (!canCreate) {
      throw new ForbiddenException('Limite de disparos atingido. Faça upgrade para enviar mais.');
    }

    const { recipients, attachments, ...disparoData } = createDisparoDto;

    return this.prisma.disparo.create({
      data: {
        ...disparoData,
        companyId,
        recipients: {
          create: recipients?.map(recipient => ({
            name: recipient.name,
            phone: recipient.phone,
          })) || []
        },
        attachments: {
          create: attachments?.map(attachment => ({
            name: attachment.name,
            type: attachment.type,
            size: attachment.size,
            url: attachment.url,
            isImage: attachment.isImage,
          })) || []
        }
      },
      include: {
        recipients: true,
        attachments: true,
        company: true,
      },
    });
  }

  async findAll(companyId: string) {
    return this.prisma.disparo.findMany({
      where: { companyId },
      include: {
        recipients: true,
        attachments: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const disparo = await this.prisma.disparo.findFirst({
      where: { id, companyId },
      include: {
        recipients: true,
        attachments: true,
        company: true,
      },
    });

    if (!disparo) {
      throw new NotFoundException('Disparo not found');
    }

    return disparo;
  }

  async update(id: string, updateDisparoDto: UpdateDisparoDto, companyId: string) {
    const disparo = await this.findOne(id, companyId);
    
    const { recipients, attachments, ...disparoData } = updateDisparoDto;
    
    return this.prisma.disparo.update({
      where: { id },
      data: {
        ...disparoData,
        ...(recipients && {
          recipients: {
            deleteMany: {},
            create: recipients.map(recipient => ({
              name: recipient.name,
              phone: recipient.phone,
            }))
          }
        }),
        ...(attachments && {
          attachments: {
            deleteMany: {},
            create: attachments.map(attachment => ({
              name: attachment.name,
              type: attachment.type,
              size: attachment.size,
              url: attachment.url,
              isImage: attachment.isImage,
            }))
          }
        })
      },
      include: {
        recipients: true,
        attachments: true,
        company: true,
      },
    });
  }

  async remove(id: string, companyId: string) {
    const disparo = await this.findOne(id, companyId);
    
    return this.prisma.disparo.delete({
      where: { id },
    });
  }

  async sendDisparo(id: string, companyId: string) {
    const disparo = await this.findOne(id, companyId);
    
    if (disparo.status !== 'AGENDADO') {
      throw new ForbiddenException('Disparo não está agendado para envio');
    }

    // Verificar limites novamente antes de enviar
    const canSend = await this.checkDisparoLimits(companyId, disparo.recipients.length);
    if (!canSend) {
      throw new ForbiddenException('Limite de disparos atingido. Faça upgrade para enviar mais.');
    }

    // Atualizar status para enviando
    await this.prisma.disparo.update({
      where: { id },
      data: { status: 'ENVIANDO' },
    });

    try {
      // Simular envio de mensagens (aqui você integraria com o WhatsApp)
      let enviados = 0;
      let erros = 0;

      for (const recipient of disparo.recipients) {
        try {
          // Aqui você faria a integração real com WhatsApp
          // await this.whatsappService.sendMessage(recipient.phone, disparo.message);
          
          await this.prisma.disparoDestinatario.update({
            where: { id: recipient.id },
            data: {
              status: 'ENVIADO',
              sentAt: new Date(),
            },
          });
          
          enviados++;
        } catch (error) {
          await this.prisma.disparoDestinatario.update({
            where: { id: recipient.id },
            data: {
              status: 'ERRO',
              error: error.message,
            },
          });
          
          erros++;
        }
      }

      // Atualizar contadores da empresa
      await this.prisma.company.update({
        where: { id: companyId },
        data: {
          currentDisparos: { increment: enviados },
          currentDisparosDiarios: { increment: enviados },
        },
      });

      // Finalizar disparo
      return this.prisma.disparo.update({
        where: { id },
        data: {
          status: 'CONCLUIDO',
          sentAt: new Date(),
          totalSent: enviados,
          totalError: erros,
        },
        include: {
          recipients: true,
          attachments: true,
          company: true,
        },
      });
    } catch (error) {
      // Em caso de erro, marcar como erro
      await this.prisma.disparo.update({
        where: { id },
        data: { status: 'ERRO' },
      });
      
      throw error;
    }
  }

  async cancelDisparo(id: string, companyId: string) {
    const disparo = await this.findOne(id, companyId);
    
    if (disparo.status !== 'AGENDADO') {
      throw new ForbiddenException('Apenas disparos agendados podem ser cancelados');
    }

    return this.prisma.disparo.update({
      where: { id },
      data: { status: 'CANCELADO' },
      include: {
        recipients: true,
        attachments: true,
        company: true,
      },
    });
  }

  async checkDisparoLimits(companyId: string, quantity: number): Promise<boolean> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        currentDisparos: true,
        currentDisparosDiarios: true,
        maxDisparos: true,
        maxDisparosDiarios: true,
        isTrialActive: true,
        trialEndDate: true,
      },
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

    // Verificar limite mensal
    if (company.currentDisparos + quantity > company.maxDisparos) {
      return false;
    }

    // Verificar limite diário
    if (company.currentDisparosDiarios + quantity > company.maxDisparosDiarios) {
      return false;
    }

    return true;
  }
}
