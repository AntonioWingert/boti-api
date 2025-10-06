import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SessionStatus } from '@prisma/client';
import { CreateSessionDto } from './dto/create-session.dto';

export interface UpdateSessionDto {
  status?: SessionStatus;
  phoneNumber?: string;
  qrCode?: string;
  lastSeen?: Date;
  error?: string;
  chatbotId?: string;
}

@Injectable()
export class WhatsappSessionService {
  private readonly logger = new Logger(WhatsappSessionService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Cria uma nova sessão do WhatsApp para uma empresa
   */
  async createSession(data: CreateSessionDto) {
    try {
      this.logger.log('Creating session with data:', data);
      
      // Verificar se a empresa existe
      const company = await this.prisma.company.findUnique({
        where: { id: data.companyId }
      });
      
      if (!company) {
        this.logger.error(`Company with ID ${data.companyId} not found`);
        throw new Error(`Company with ID ${data.companyId} not found`);
      }
      
      this.logger.log(`Company found: ${company.name} (${company.id})`);

      const session = await this.prisma.whatsAppSession.create({
        data: {
          companyId: data.companyId,
          sessionName: data.sessionName,
          phoneNumber: data.phoneNumber,
          chatbotId: data.chatbotId,
          status: SessionStatus.DISCONNECTED,
        },
        include: {
          company: true,
          chatbot: true,
        },
      });

      this.logger.log(`Session created for company ${data.companyId}: ${data.sessionName}`);
      this.logger.log(`Session details:`, {
        id: session.id,
        sessionName: session.sessionName,
        companyId: session.companyId,
        companyName: session.company?.name,
        status: session.status,
        active: session.active
      });
      return session;
    } catch (error) {
      this.logger.error('Error creating session:', error);
      throw error;
    }
  }

  /**
   * Busca uma sessão por ID
   */
  async findById(id: string) {
    return this.prisma.whatsAppSession.findUnique({
      where: { id },
      include: {
        company: true,
        chatbot: true,
      },
    });
  }

  /**
   * Busca todas as sessões
   */
  async findAll() {
    return this.prisma.whatsAppSession.findMany({
      include: {
        company: true,
        chatbot: true,
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  }

  /**
   * Busca sessões de uma empresa
   */
  async findByCompany(companyId: string) {
    this.logger.log(`Searching sessions for company: ${companyId}`);
    
    const sessions = await this.prisma.whatsAppSession.findMany({
      where: { 
        companyId
      },
      include: {
        company: true,
        chatbot: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    
    this.logger.log(`Found ${sessions.length} sessions for company ${companyId}`);
    return sessions;
  }

  /**
   * Busca sessão ativa de uma empresa
   */
  async findActiveByCompany(companyId: string) {
    return this.prisma.whatsAppSession.findFirst({
      where: { 
        companyId,
        status: SessionStatus.CONNECTED,
        active: true 
      },
      include: {
        company: true,
        chatbot: true,
      },
    });
  }

  /**
   * Atualiza uma sessão
   */
  async updateSession(id: string, data: UpdateSessionDto) {
    try {
      const session = await this.prisma.whatsAppSession.update({
        where: { id },
        data: {
          ...data,
          updatedAt: new Date(),
        },
        include: {
          company: true,
          chatbot: true,
        },
      });

      this.logger.log(`Session updated: ${id}`);
      return session;
    } catch (error) {
      this.logger.error('Error updating session:', error);
      throw error;
    }
  }

  /**
   * Atualiza status da sessão
   */
  async updateStatus(id: string, status: SessionStatus, error?: string) {
    return this.updateSession(id, {
      status,
      error,
      lastSeen: status === SessionStatus.CONNECTED ? new Date() : undefined,
    });
  }

  /**
   * Atualiza QR Code da sessão
   */
  async updateQRCode(id: string, qrCode: string) {
    return this.updateSession(id, {
      status: SessionStatus.CONNECTING,
      qrCode,
    });
  }

  /**
   * Conecta uma sessão
   */
  async connectSession(id: string, phoneNumber: string) {
    this.logger.log(`🔗 Connecting session ${id} with phone ${phoneNumber}`);
    
    const result = await this.updateSession(id, {
      status: SessionStatus.CONNECTED,
      phoneNumber,
      lastSeen: new Date(),
      qrCode: undefined,
      error: undefined,
    });
    
    this.logger.log(`✅ Session ${id} connected successfully`);
    return result;
  }

  /**
   * Desconecta uma sessão
   */
  async disconnectSession(id: string, error?: string) {
    return this.updateSession(id, {
      status: SessionStatus.DISCONNECTED,
      error,
      lastSeen: new Date(),
    });
  }

  /**
   * Marca sessão como erro
   */
  async markSessionError(id: string, error: string) {
    return this.updateSession(id, {
      status: SessionStatus.ERROR,
      error,
    });
  }

  /**
   * Desativa uma sessão
   */
  async deactivateSession(id: string) {
    return this.prisma.whatsAppSession.update({
      where: { id },
      data: {
        active: false,
        status: SessionStatus.DISCONNECTED,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Remove uma sessão
   */
  async deleteSession(id: string) {
    return this.prisma.whatsAppSession.delete({
      where: { id },
    });
  }

  /**
   * Busca todas as sessões ativas
   */
  async findActiveSessions() {
    return this.prisma.whatsAppSession.findMany({
      where: { 
        active: true,
        status: SessionStatus.CONNECTED 
      },
      include: {
        company: true,
        chatbot: true,
      },
      orderBy: {
        lastSeen: 'desc',
      },
    });
  }

  /**
   * Busca sessões por status
   */
  async findByStatus(status: SessionStatus) {
    return this.prisma.whatsAppSession.findMany({
      where: { 
        status,
        active: true 
      },
      include: {
        company: true,
        chatbot: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });
  }

  /**
   * Verifica e sincroniza o status real das sessões com o banco
   */
  async syncSessionStatus(sessionId: string, isActuallyConnected: boolean) {
    try {
      const session = await this.findById(sessionId);
      if (!session) {
        this.logger.warn(`Session ${sessionId} not found for sync`);
        return;
      }

      const currentStatus = session.status;
      const shouldBeConnected = isActuallyConnected;

      // Se o status no banco não corresponde ao status real, atualizar
      if (shouldBeConnected && currentStatus !== SessionStatus.CONNECTED) {
        this.logger.log(`Syncing session ${sessionId}: marking as CONNECTED (was ${currentStatus})`);
        await this.updateStatus(sessionId, SessionStatus.CONNECTED);
      } else if (!shouldBeConnected && currentStatus === SessionStatus.CONNECTED) {
        this.logger.log(`Syncing session ${sessionId}: marking as DISCONNECTED (was CONNECTED)`);
        await this.updateStatus(sessionId, SessionStatus.DISCONNECTED);
      } else {
        this.logger.log(`Session ${sessionId} status is already in sync: ${currentStatus}`);
      }
    } catch (error) {
      this.logger.error(`Error syncing session status for ${sessionId}:`, error);
    }
  }

  /**
   * Verifica o status de todas as sessões ativas e sincroniza se necessário
   */
  async syncAllActiveSessions(connectionChecker: (sessionId: string) => Promise<boolean>) {
    try {
      const activeSessions = await this.findByStatus(SessionStatus.CONNECTED);
      this.logger.log(`Checking ${activeSessions.length} active sessions for sync`);

      for (const session of activeSessions) {
        try {
          const isActuallyConnected = await connectionChecker(session.id);
          await this.syncSessionStatus(session.id, isActuallyConnected);
        } catch (error) {
          this.logger.error(`Error checking connection for session ${session.id}:`, error);
          // Se não conseguir verificar, marcar como desconectado
          await this.updateStatus(session.id, SessionStatus.DISCONNECTED, 'Connection check failed');
        }
      }
    } catch (error) {
      this.logger.error('Error syncing all active sessions:', error);
    }
  }

  /**
   * Limpa sessões antigas (mais de 30 dias sem atividade)
   */
  async cleanupOldSessions() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await this.prisma.whatsAppSession.updateMany({
      where: {
        lastSeen: {
          lt: thirtyDaysAgo,
        },
        status: {
          in: [SessionStatus.DISCONNECTED, SessionStatus.ERROR],
        },
        active: true,
      },
      data: {
        active: false,
      },
    });

    this.logger.log(`Cleaned up ${result.count} old sessions`);
    return result;
  }
}
