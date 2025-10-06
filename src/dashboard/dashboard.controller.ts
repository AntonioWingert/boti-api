import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../users/jwt-auth.guard';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@Controller('dashboard')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Obter estatísticas do dashboard' })
  @ApiResponse({ status: 200, description: 'Estatísticas do dashboard' })
  async getStats(@Request() req: any) {
    const userRole = req.user?.role;
    const userCompanyId = req.user?.companyId;
    
    console.log('Dashboard stats - User:', { role: userRole, companyId: userCompanyId });
    
    return this.dashboardService.getStats(userRole, userCompanyId);
  }

  @Get('connections')
  @ApiOperation({ summary: 'Obter conexões recentes' })
  @ApiResponse({ status: 200, description: 'Conexões recentes' })
  async getConnections(@Request() req: any) {
    const userRole = req.user?.role;
    const userCompanyId = req.user?.companyId;
    
    console.log('Dashboard connections - User:', { role: userRole, companyId: userCompanyId });
    
    return this.dashboardService.getConnections(userRole, userCompanyId);
  }

  @Get('messages')
  @ApiOperation({ summary: 'Obter mensagens recentes' })
  @ApiResponse({ status: 200, description: 'Mensagens recentes' })
  async getMessages(@Request() req: any) {
    const userRole = req.user?.role;
    const userCompanyId = req.user?.companyId;
    
    console.log('Dashboard messages - User:', { role: userRole, companyId: userCompanyId });
    
    return this.dashboardService.getMessages(userRole, userCompanyId);
  }
}
