import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(userRole?: string, userCompanyId?: string) {
    try {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

      // Definir filtros baseados no role do usuário
      const connectionWhere = userRole === 'ADMIN' ? {} : { companyId: userCompanyId };
      const clientWhere = userRole === 'ADMIN' ? {} : { companyId: userCompanyId };
      const chatbotWhere = userRole === 'ADMIN' ? {} : { companyId: userCompanyId };
      const messageWhere = userRole === 'ADMIN' ? {} : { 
        conversation: { companyId: userCompanyId }
      };

      // Estatísticas de conexões
      const [totalConnections, activeConnections, inactiveConnections] = await Promise.all([
        this.prisma.whatsAppSession.count({ where: connectionWhere }),
        this.prisma.whatsAppSession.count({
          where: { ...connectionWhere, status: 'CONNECTED' }
        }),
        this.prisma.whatsAppSession.count({
          where: { ...connectionWhere, status: 'DISCONNECTED' }
        })
      ]);

      // Estatísticas de clientes
      const [totalClients, newClientsToday] = await Promise.all([
        this.prisma.client.count({ where: clientWhere }),
        this.prisma.client.count({
          where: { 
            ...clientWhere,
            createdAt: { gte: startOfDay }
          }
        })
      ]);

      // Estatísticas de chatbots
      const [totalChatbots, activeChatbots] = await Promise.all([
        this.prisma.chatbot.count({ where: chatbotWhere }),
        this.prisma.chatbot.count({
          where: { ...chatbotWhere, active: true }
        })
      ]);

      // Estatísticas de mensagens
      const [totalMessages, messagesToday, messagesLastMonth] = await Promise.all([
        this.prisma.message.count({ where: messageWhere }),
        this.prisma.message.count({
          where: { 
            ...messageWhere,
            createdAt: { gte: startOfDay }
          }
        }),
        this.prisma.message.count({
          where: { 
            ...messageWhere,
            createdAt: { 
              gte: startOfLastMonth,
              lte: endOfLastMonth
            }
          }
        })
      ]);

      // Calcular mudanças percentuais baseadas em comparação com período anterior
      const connectionsChange = totalConnections > 0 ? 
        Math.round(((activeConnections / totalConnections) * 100) - 50) : 0;
      
      // Para clientes, comparar com clientes do mês passado
      const clientsLastMonth = await this.prisma.client.count({
        where: { 
          ...clientWhere,
          createdAt: { 
            gte: startOfLastMonth,
            lte: endOfLastMonth
          }
        }
      });
      
      const clientsChange = clientsLastMonth > 0 ? 
        Math.round(((newClientsToday - clientsLastMonth) / clientsLastMonth) * 100) : 
        (newClientsToday > 0 ? 100 : 0);
      
      const chatbotsChange = totalChatbots > 0 ? 
        Math.round(((activeChatbots / totalChatbots) * 100) - 50) : 0;
      
      const messagesChange = messagesLastMonth > 0 ? 
        Math.round(((messagesToday - messagesLastMonth) / messagesLastMonth) * 100) : 
        (messagesToday > 0 ? 100 : 0);

      return {
        connections: {
          total: totalConnections,
          active: activeConnections,
          inactive: inactiveConnections,
          change: connectionsChange
        },
        clients: {
          total: totalClients,
          new: newClientsToday,
          change: clientsChange
        },
        chatbots: {
          total: totalChatbots,
          active: activeChatbots,
          change: chatbotsChange
        },
        messages: {
          total: totalMessages,
          today: messagesToday,
          change: messagesChange
        }
      };
    } catch (error) {
      console.error('Error getting dashboard stats:', error);
      return {
        connections: { total: 0, active: 0, inactive: 0, change: 0 },
        clients: { total: 0, new: 0, change: 0 },
        chatbots: { total: 0, active: 0, change: 0 },
        messages: { total: 0, today: 0, change: 0 }
      };
    }
  }

  async getConnections(userRole?: string, userCompanyId?: string) {
    try {
      const where = userRole === 'ADMIN' ? {} : { companyId: userCompanyId };
      
      return this.prisma.whatsAppSession.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: 5,
        include: {
          company: {
            select: { name: true }
          }
        }
      });
    } catch (error) {
      console.error('Error getting connections:', error);
      return [];
    }
  }

  async getMessages(userRole?: string, userCompanyId?: string) {
    try {
      const where = userRole === 'ADMIN' ? {} : { 
        conversation: { companyId: userCompanyId }
      };
      
      return this.prisma.message.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          conversation: {
            include: {
              client: {
                select: { name: true }
              }
            }
          }
        }
      });
    } catch (error) {
      console.error('Error getting messages:', error);
      return [];
    }
  }
}
