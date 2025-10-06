import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { CompaniesModule } from '../companies/companies.module';
import { PendingUsersModule } from '../admin/pending-users.module';

@Module({
  imports: [CompaniesModule, PendingUsersModule],
  controllers: [AuthController],
})
export class AuthModule {}
