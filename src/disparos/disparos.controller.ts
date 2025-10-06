import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { DisparosService } from './disparos.service';
import { CreateDisparoDto } from './dto/create-disparo.dto';
import { UpdateDisparoDto } from './dto/update-disparo.dto';
import { JwtAuthGuard } from '../users/jwt-auth.guard';

@Controller('disparos')
@UseGuards(JwtAuthGuard)
export class DisparosController {
  constructor(private readonly disparosService: DisparosService) {}

  @Post()
  create(@Body() createDisparoDto: CreateDisparoDto, @Request() req) {
    return this.disparosService.create(createDisparoDto, req.user.companyId);
  }

  @Get()
  findAll(@Request() req) {
    return this.disparosService.findAll(req.user.companyId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.disparosService.findOne(id, req.user.companyId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDisparoDto: UpdateDisparoDto, @Request() req) {
    return this.disparosService.update(id, updateDisparoDto, req.user.companyId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.disparosService.remove(id, req.user.companyId);
  }

  @Post(':id/send')
  sendDisparo(@Param('id') id: string, @Request() req) {
    return this.disparosService.sendDisparo(id, req.user.companyId);
  }

  @Post(':id/cancel')
  cancelDisparo(@Param('id') id: string, @Request() req) {
    return this.disparosService.cancelDisparo(id, req.user.companyId);
  }

  @Post('check-limits')
  checkLimits(@Request() req, @Body() body: { quantidade: number }) {
    return this.disparosService.checkDisparoLimits(req.user.companyId, body.quantidade);
  }
}
