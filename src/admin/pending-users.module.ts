import { Module } from '@nestjs/common';
import { PendingUsersService } from './pending-users.service';
import { PendingUsersController } from './pending-users.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key',
      signOptions: { expiresIn: '24h' },
    }),
  ],
  controllers: [PendingUsersController],
  providers: [PendingUsersService],
  exports: [PendingUsersService],
})
export class PendingUsersModule {}
