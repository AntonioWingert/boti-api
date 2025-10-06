import { Controller, Get, Post, Param, Body, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('flow-test')
export class FlowTestController {
  private readonly logger = new Logger(FlowTestController.name);

  constructor(private readonly prisma: PrismaService) {}




  @Post(':flowId/setup-connections')
  async setupConnections(@Param('flowId') flowId: string) {
    try {
      this.logger.log(`Setting up connections for flow ${flowId}`);

      // Buscar o fluxo com nós e opções
      const flow = await this.prisma.flow.findUnique({
        where: { id: flowId },
        include: {
          nodes: {
            include: {
              options: true,
              outgoingConnections: true
            }
          }
        }
      });

      if (!flow) {
        return { error: 'Flow not found' };
      }

      const results: any[] = [];
      let connectionsCreated = 0;

      for (const node of flow.nodes) {
        if (node.options.length > 0) {
          this.logger.log(`Processing node: ${node.message} with ${node.options.length} options`);

          for (const option of node.options) {
            // Se a opção tem targetNodeId, criar conexão
            if (option.targetNodeId) {
              // Verificar se conexão já existe
              const existingConnection = node.outgoingConnections.find(conn => 
                conn.sourceNodeId === node.id && conn.targetNodeId === option.targetNodeId
              );

              if (!existingConnection) {
                try {
                  const connection = await this.prisma.flowConnection.create({
                    data: {
                      id: `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                      sourceNodeId: node.id,
                      targetNodeId: option.targetNodeId,
                      condition: null,
                    }
                  });

                  results.push({
                    optionId: option.id,
                    optionText: option.text,
                    connectionId: connection.id,
                    sourceNodeId: node.id,
                    targetNodeId: option.targetNodeId
                  });

                  connectionsCreated++;
                  this.logger.log(`✅ Created connection for option: ${option.text}`);
                } catch (error) {
                  this.logger.error(`❌ Error creating connection for option ${option.text}:`, error);
                }
              } else {
                this.logger.log(`✅ Connection already exists for option: ${option.text}`);
              }
            } else {
              this.logger.log(`⚠️ Option has no targetNodeId: ${option.text}`);
            }
          }
        }
      }

      return {
        success: true,
        message: `Setup ${connectionsCreated} connections from options`,
        connectionsCreated,
        results
      };

    } catch (error) {
      this.logger.error('Error setting up connections:', error);
      return { error: error.message };
    }
  }
}
