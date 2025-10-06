import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(private readonly prisma: PrismaService) {}

  async globalSearch(query: string, userRole: string, userCompanyId: string) {
    if (!query || query.trim().length < 2) {
      return [];
    }

    const searchTerm = query.trim();
    const results: any[] = [];

    try {
      // Buscar conversas
      const conversations = await this.searchConversations(searchTerm, userRole, userCompanyId);
      results.push(...conversations);

      // Buscar clientes
      const clients = await this.searchClients(searchTerm, userRole, userCompanyId);
      results.push(...clients);

      // Buscar chatbots
      const chatbots = await this.searchChatbots(searchTerm, userRole, userCompanyId);
      results.push(...chatbots);

      // Buscar empresas (apenas para ADMIN)
      if (userRole === 'ADMIN') {
        const companies = await this.searchCompanies(searchTerm);
        results.push(...companies);
      }

      // Ordenar por relevância e limitar resultados
      return results
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, 10);

    } catch (error) {
      this.logger.error('Error in global search:', error);
      return [];
    }
  }

  private async searchConversations(query: string, userRole: string, userCompanyId: string) {
    const where = userRole === 'ADMIN' ? {} : { companyId: userCompanyId };

    const conversations = await this.prisma.conversation.findMany({
      where: {
        ...where,
        OR: [
          { client: { name: { contains: query } } },
          { client: { phone: { contains: query } } },
          { lastMessage: { contains: query } }
        ]
      },
      include: {
        client: true,
        chatbot: true
      },
      take: 5
    });

    return conversations.map(conv => ({
      id: conv.id,
      type: 'conversation',
      title: `Conversa com ${conv.client.name}`,
      description: conv.lastMessage || 'Sem mensagens',
      status: conv.status,
      href: `/connections`, // Redireciona para página de conexões
      relevance: this.calculateRelevance(query, conv.client.name, conv.lastMessage)
    }));
  }

  private async searchClients(query: string, userRole: string, userCompanyId: string) {
    const where = userRole === 'ADMIN' ? {} : { companyId: userCompanyId };

    const clients = await this.prisma.client.findMany({
      where: {
        ...where,
        OR: [
          { name: { contains: query } },
          { phone: { contains: query } },
          { email: { contains: query } }
        ]
      },
      take: 5
    });

    return clients.map(client => ({
      id: client.id,
      type: 'client',
      title: client.name,
      description: `${client.phone}${client.email ? ` • ${client.email}` : ''}`,
      status: client.active ? 'ACTIVE' : 'INACTIVE',
      href: `/clients/${client.id}`,
      relevance: this.calculateRelevance(query, client.name, client.phone, client.email)
    }));
  }

  private async searchChatbots(query: string, userRole: string, userCompanyId: string) {
    const where = userRole === 'ADMIN' ? {} : { companyId: userCompanyId };

    const chatbots = await this.prisma.chatbot.findMany({
      where: {
        ...where,
        OR: [
          { name: { contains: query } },
          { description: { contains: query } }
        ]
      },
      take: 5
    });

    return chatbots.map(chatbot => ({
      id: chatbot.id,
      type: 'chatbot',
      title: chatbot.name,
      description: chatbot.description || 'Sem descrição',
      status: chatbot.active ? 'ACTIVE' : 'INACTIVE',
      href: `/chatbots/${chatbot.id}`,
      relevance: this.calculateRelevance(query, chatbot.name, chatbot.description)
    }));
  }

  private async searchCompanies(query: string) {
    const companies = await this.prisma.company.findMany({
      where: {
        OR: [
          { name: { contains: query } },
          { email: { contains: query } }
        ]
      },
      take: 5
    });

    return companies.map(company => ({
      id: company.id,
      type: 'company',
      title: company.name,
      description: company.email,
      status: company.active ? 'ACTIVE' : 'INACTIVE',
      href: `/companies/${company.id}`,
      relevance: this.calculateRelevance(query, company.name, company.email)
    }));
  }

  private calculateRelevance(query: string, ...fields: (string | null | undefined)[]): number {
    const queryLower = query.toLowerCase();
    let relevance = 0;

    fields.forEach(field => {
      if (!field) return;
      
      const fieldLower = field.toLowerCase();
      
      // Match exato
      if (fieldLower === queryLower) {
        relevance += 100;
      }
      // Começa com a query
      else if (fieldLower.startsWith(queryLower)) {
        relevance += 80;
      }
      // Contém a query
      else if (fieldLower.includes(queryLower)) {
        relevance += 60;
      }
      // Palavras individuais
      else {
        const words = fieldLower.split(/\s+/);
        words.forEach(word => {
          if (word.startsWith(queryLower)) {
            relevance += 40;
          } else if (word.includes(queryLower)) {
            relevance += 20;
          }
        });
      }
    });

    return relevance;
  }
}
