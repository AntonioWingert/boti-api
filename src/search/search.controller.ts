import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../users/jwt-auth.guard';
import { SearchService } from './search.service';

@ApiTags('search')
@Controller('search')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @ApiOperation({ summary: 'Busca global no sistema' })
  @ApiResponse({ status: 200, description: 'Resultados da busca' })
  async search(
    @Query('q') query: string,
    @Request() req: any
  ) {
    const userRole = req.user?.role;
    const userCompanyId = req.user?.companyId;
    
    return this.searchService.globalSearch(query, userRole, userCompanyId);
  }
}
