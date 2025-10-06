import { Module } from '@nestjs/common';
import { FlowController } from './flow.controller';
import { FlowTestController } from './flow-test.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [FlowController, FlowTestController],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class FlowModule {}

