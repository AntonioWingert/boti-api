import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WebSocketGateway, WebSocketServer, SubscribeMessage, ConnectedSocket, MessageBody } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  companyId?: string;
  userRole?: string;
}

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3001',
    credentials: true,
  },
  namespace: '/whatsapp-events',
})
export class EventsGateway {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);
  private connectedClients = new Map<string, AuthenticatedSocket>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(@ConnectedSocket() client: AuthenticatedSocket) {
    try {
      // Verificar autenticação via token
      const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.replace('Bearer ', '');
      
      if (!token) {
        this.logger.warn('Client connected without token');
        client.disconnect();
        return;
      }

      // Verificar e decodificar token
      const payload = this.jwtService.verify(token);
      
      client.userId = payload.sub;
      client.companyId = payload.companyId;
      client.userRole = payload.role;

      this.connectedClients.set(client.id, client);
      
      this.logger.log(`Client connected: ${client.id} (User: ${client.userId}, Company: ${client.companyId})`);
      
      // Enviar confirmação de conexão
      client.emit('connected', {
        message: 'Connected to WhatsApp events',
        userId: client.userId,
        companyId: client.companyId,
      });

    } catch (error) {
      this.logger.error('Authentication failed:', error);
      client.disconnect();
    }
  }

  handleDisconnect(@ConnectedSocket() client: AuthenticatedSocket) {
    this.connectedClients.delete(client.id);
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // Métodos para envio de notificações
  sendToUser(userId: string, event: string, data: any) {
    const userClients = Array.from(this.connectedClients.values())
      .filter(client => client.userId === userId);
    
    userClients.forEach(client => {
      client.emit(event, data);
    });
    
    this.logger.log(`Sent ${event} to user ${userId} (${userClients.length} clients)`);
  }

  sendToCompany(companyId: string, event: string, data: any) {
    const companyClients = Array.from(this.connectedClients.values())
      .filter(client => client.companyId === companyId);
    
    companyClients.forEach(client => {
      client.emit(event, data);
    });
    
    this.logger.log(`Sent ${event} to company ${companyId} (${companyClients.length} clients)`);
  }

  sendToAdmins(event: string, data: any) {
    const adminClients = Array.from(this.connectedClients.values())
      .filter(client => client.userRole === 'ADMIN');
    
    adminClients.forEach(client => {
      client.emit(event, data);
    });
    
    this.logger.log(`Sent ${event} to admins (${adminClients.length} clients)`);
  }

  sendToAll(event: string, data: any) {
    this.server.emit(event, data);
    this.logger.log(`Sent ${event} to all connected clients`);
  }

  @SubscribeMessage('join-company')
  handleJoinCompany(@ConnectedSocket() client: AuthenticatedSocket) {
    if (client.companyId) {
      client.join(`company:${client.companyId}`);
      this.logger.log(`Client ${client.id} joined company room: ${client.companyId}`);
    }
  }

  @SubscribeMessage('leave-company')
  handleLeaveCompany(@ConnectedSocket() client: AuthenticatedSocket) {
    if (client.companyId) {
      client.leave(`company:${client.companyId}`);
      this.logger.log(`Client ${client.id} left company room: ${client.companyId}`);
    }
  }

  @SubscribeMessage('get-sessions')
  async handleGetSessions(@ConnectedSocket() client: AuthenticatedSocket) {
    if (!client.companyId) {
      this.logger.warn(`Client ${client.id} requested sessions but has no companyId`);
      return;
    }

    try {
      // Buscar sessões do banco de dados
      this.logger.log(`🔍 Searching sessions for company: ${client.companyId} (User role: ${client.userRole})`);
      
      // Se for admin, buscar todas as sessões; senão, filtrar por empresa
      let sessions;
      if (client.userRole === 'ADMIN') {
        this.logger.log(`👑 Admin user - fetching all sessions`);
        sessions = await this.prisma.whatsAppSession.findMany({
          include: { company: true },
          orderBy: { createdAt: 'desc' }
        });
      } else {
        this.logger.log(`👤 Regular user - fetching sessions for company ${client.companyId}`);
        sessions = await this.prisma.whatsAppSession.findMany({
          where: { companyId: client.companyId },
          include: { company: true },
          orderBy: { createdAt: 'desc' }
        });
      }
      
      this.logger.log(`📊 Total sessions found: ${sessions.length}`);
      
      // Log das sessões encontradas
      sessions.forEach((session, index) => {
        this.logger.log(`📱 Session ${index + 1}: ${session.sessionName} (Company: ${session.companyId}, Status: ${session.status})`);
      });

      const sessionsData = sessions.map(session => ({
        id: session.id,
        sessionName: session.sessionName,
        status: session.status,
        phoneNumber: session.phoneNumber,
        lastSeen: session.lastSeen,
        qrCode: session.qrCode,
        error: session.error,
        companyId: session.companyId,
        company: session.company ? { name: session.company.name } : null,
      }));

      client.emit('sessions-updated', {
        type: 'sessions-updated',
        data: {
          sessions: sessionsData,
          count: sessionsData.length,
        },
        timestamp: new Date().toISOString(),
      });
      
      this.logger.log(`Sessions requested by client ${client.id} for company ${client.companyId}: ${sessionsData.length} sessions found`);
    } catch (error) {
      this.logger.error('Error getting sessions:', error);
      client.emit('sessions-updated', {
        type: 'sessions-updated',
        data: {
          sessions: [],
          count: 0,
        },
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Métodos para emitir eventos específicos
  emitSessionStatusChange(companyId: string, sessionData: any) {
    this.server.to(`company:${companyId}`).emit('session-status-change', {
      type: 'session-status-change',
      data: sessionData,
      timestamp: new Date().toISOString(),
    });
    
    this.logger.log(`Session status change emitted for company ${companyId}:`, sessionData);
  }

  emitQRCodeGenerated(companyId: string, sessionId: string, qrCode: string) {
    this.server.to(`company:${companyId}`).emit('qr-code-generated', {
      type: 'qr-code-generated',
      data: {
        sessionId,
        qrCode,
        timestamp: new Date().toISOString(),
      },
    });
    
    this.logger.log(`QR Code generated event emitted for session ${sessionId}`);
  }

  emitConnectionError(companyId: string, sessionId: string, error: string) {
    this.server.to(`company:${companyId}`).emit('connection-error', {
      type: 'connection-error',
      data: {
        sessionId,
        error,
        timestamp: new Date().toISOString(),
      },
    });
    
    this.logger.log(`Connection error event emitted for session ${sessionId}:`, error);
  }

  emitConnectionSuccess(companyId: string, sessionId: string, phoneNumber?: string) {
    this.server.to(`company:${companyId}`).emit('connection-success', {
      type: 'connection-success',
      data: {
        sessionId,
        phoneNumber,
        timestamp: new Date().toISOString(),
      },
    });
    
    this.logger.log(`Connection success event emitted for session ${sessionId}`);
  }

  // Método para broadcast geral
  broadcastToCompany(companyId: string, event: string, data: any) {
    this.server.to(`company:${companyId}`).emit(event, {
      type: event,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  // Método para emitir para todos os clientes
  emitToAll(event: string, data: any) {
    this.server.emit(event, {
      type: event,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  // Método para obter estatísticas
  getConnectionStats() {
    return {
      totalConnections: this.connectedClients.size,
      connectionsByCompany: Array.from(this.connectedClients.values()).reduce((acc, client) => {
        if (client.companyId) {
          acc[client.companyId] = (acc[client.companyId] || 0) + 1;
        }
        return acc;
      }, {} as Record<string, number>),
    };
  }
}