import { Controller, Get, Post, Body, Param, Delete, UseGuards } from '@nestjs/common';
import { PendingUsersService } from './pending-users.service';
import { CreatePendingUserDto } from './dto/create-pending-user.dto';
import { JwtAuthGuard } from '../users/jwt-auth.guard';
import { AdminGuard } from '../users/admin.guard';

@Controller('admin/pending-users')
@UseGuards(JwtAuthGuard, AdminGuard)
export class PendingUsersController {
  constructor(private readonly pendingUsersService: PendingUsersService) {}

  @Post()
  create(@Body() createPendingUserDto: CreatePendingUserDto) {
    return this.pendingUsersService.create(createPendingUserDto);
  }

  @Get()
  findAll() {
    return this.pendingUsersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.pendingUsersService.findOne(id);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string) {
    return this.pendingUsersService.approve(id);
  }

  @Post(':id/reject')
  reject(@Param('id') id: string) {
    return this.pendingUsersService.reject(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.pendingUsersService.remove(id);
  }
}
