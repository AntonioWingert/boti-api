import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  @Get('debug/sessions')
  async getDebugSessions() {
    try {
      const { PrismaService } = await import('./prisma/prisma.service');
      const prisma = new PrismaService();
      
      const sessions = await prisma.whatsAppSession.findMany({
        include: { company: true },
        orderBy: { createdAt: 'desc' }
      });

      return {
        total: sessions.length,
        sessions: sessions.map(session => ({
          id: session.id,
          sessionName: session.sessionName,
          status: session.status,
          companyId: session.companyId,
          companyName: session.company?.name,
          createdAt: session.createdAt,
        }))
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  @Get('debug/migrate-sessions')
  async migrateSessions() {
    try {
      const { PrismaService } = await import('./prisma/prisma.service');
      const prisma = new PrismaService();
      
      // Buscar todas as sessões
      const sessions = await prisma.whatsAppSession.findMany();
      
      // Migrar para a empresa correta
      const targetCompanyId = 'cmgcn1qyl00009gxdz8w0vqlz';
      
      const updatePromises = sessions.map(session => 
        prisma.whatsAppSession.update({
          where: { id: session.id },
          data: { companyId: targetCompanyId }
        })
      );
      
      await Promise.all(updatePromises);
      
      return {
        message: `Migrated ${sessions.length} sessions to company ${targetCompanyId}`,
        sessions: sessions.length
      };
    } catch (error) {
      return { error: error.message };
    }
  }
}
