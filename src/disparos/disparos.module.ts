import { Module } from '@nestjs/common';
import { DisparosService } from './disparos.service';
import { DisparosController } from './disparos.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DisparosController],
  providers: [DisparosService],
  exports: [DisparosService],
})
export class DisparosModule {}
