import { Controller, Get, Post, Put, Delete, Body, Param, Query, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('flows')
export class FlowController {
  private readonly logger = new Logger(FlowController.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Criar novo fluxo
   */
  @Post()
  async createFlow(@Body() flowData: { name: string; description?: string; chatbotId: string }) {
    try {
      this.logger.log('Creating new flow:', flowData);

      const flow = await this.prisma.flow.create({
        data: {
          name: flowData.name,
          description: flowData.description,
          chatbotId: flowData.chatbotId,
          active: true,
        },
      });

      this.logger.log(`Flow created successfully: ${flow.id}`);
      return flow;
    } catch (error) {
      this.logger.error('Error creating flow:', error);
      throw error;
    }
  }

  /**
   * Buscar todos os fluxos
   */
  @Get()
  async getAllFlows(@Query('chatbotId') chatbotId?: string) {
    try {
      const whereClause = chatbotId ? { chatbotId } : {};
      
      const flows = await this.prisma.flow.findMany({
        where: whereClause,
        include: {
          nodes: {
            include: {
              options: true,
              outgoingConnections: {
                include: {
                  targetNode: true
                }
              }
            }
          },
          chatbot: true,
        },
      });

      this.logger.log('Flows being returned:', {
        chatbotId,
        flowsCount: flows.length,
        firstFlow: flows[0] ? {
          id: flows[0].id,
          nodesCount: flows[0].nodes.length,
          firstNode: flows[0].nodes[0] ? {
            id: flows[0].nodes[0].id,
            nodeType: flows[0].nodes[0].nodeType,
            isStart: flows[0].nodes[0].isStart,
            isEnd: flows[0].nodes[0].isEnd,
            optionsCount: flows[0].nodes[0].options?.length || 0,
            outgoingConnectionsCount: flows[0].nodes[0].outgoingConnections?.length || 0
          } : null
        } : null
      });

      // Log detalhado de todos os nós
      if (flows[0]?.nodes) {
        flows[0].nodes.forEach((node: any, index: number) => {
          this.logger.log(`Node ${index}:`, {
            id: node.id,
            nodeType: node.nodeType,
            title: node.title,
            message: node.message,
            optionsCount: node.options?.length || 0,
            outgoingConnectionsCount: node.outgoingConnections?.length || 0,
            options: node.options?.map((opt: any) => ({
              id: opt.id,
              text: opt.text,
              targetNodeId: opt.targetNodeId
            })) || [],
            outgoingConnections: node.outgoingConnections?.map((conn: any) => ({
              id: conn.id,
              sourceNodeId: conn.sourceNodeId,
              targetNodeId: conn.targetNodeId
            })) || []
          });
        });
      }

      return flows;
    } catch (error) {
      this.logger.error('Error fetching flows:', error);
      throw error;
    }
  }

  /**
   * Buscar fluxo por ID
   */
  @Get(':flowId')
  async getFlowById(@Param('flowId') flowId: string) {
    try {
      const flow = await this.prisma.flow.findUnique({
        where: { id: flowId },
        include: {
          nodes: {
            include: {
              options: true,
              outgoingConnections: {
                include: {
                  targetNode: true
                }
              }
            }
          },
          chatbot: true,
        },
      });

      if (!flow) {
        throw new Error('Flow not found');
      }

      this.logger.log('Flow data being returned:', {
        id: flow.id,
        nodesCount: flow.nodes.length,
        firstNode: flow.nodes[0] ? {
          id: flow.nodes[0].id,
          nodeType: flow.nodes[0].nodeType,
          isStart: flow.nodes[0].isStart,
          isEnd: flow.nodes[0].isEnd
        } : null
      });

      return flow;
    } catch (error) {
      this.logger.error('Error fetching flow:', error);
      throw error;
    }
  }

  /**
   * Atualizar fluxo
   */
  @Put(':flowId')
  async updateFlow(
    @Param('flowId') flowId: string,
    @Body() updateData: { name?: string; description?: string; active?: boolean }
  ) {
    try {
      this.logger.log(`Updating flow ${flowId}:`, updateData);

      const flow = await this.prisma.flow.update({
        where: { id: flowId },
        data: updateData,
      });

      this.logger.log(`Flow updated successfully: ${flow.id}`);
      return flow;
    } catch (error) {
      this.logger.error('Error updating flow:', error);
      throw error;
    }
  }

  /**
   * Deletar fluxo
   */
  @Delete(':flowId')
  async deleteFlow(@Param('flowId') flowId: string) {
    try {
      this.logger.log(`Deleting flow: ${flowId}`);

      await this.prisma.flow.delete({
        where: { id: flowId },
      });

      this.logger.log(`Flow deleted successfully: ${flowId}`);
      return { success: true, message: 'Flow deleted successfully' };
    } catch (error) {
      this.logger.error('Error deleting flow:', error);
      throw error;
    }
  }

  /**
   * Criar nó no fluxo
   */
  @Post(':flowId/nodes')
  async createNode(
    @Param('flowId') flowId: string,
    @Body() nodeData: {
      message: string;
      nodeType: 'MESSAGE' | 'OPTION' | 'INPUT' | 'CONDITION' | 'ACTION' | 'ESCALATION';
      isStart?: boolean;
    }
  ) {
    try {
      this.logger.log(`Creating node for flow ${flowId}:`, nodeData);

      const node = await this.prisma.flowNode.create({
        data: {
          flowId: flowId,
          title: nodeData.message,
          message: nodeData.message,
          nodeType: nodeData.nodeType,
          position: { x: 0, y: 0 },
          isStart: nodeData.isStart || false,
          active: true,
        },
      });

      this.logger.log(`Node created successfully: ${node.id}`);
      return node;
    } catch (error) {
      this.logger.error('Error creating node:', error);
      throw error;
    }
  }

  /**
   * Buscar nós do fluxo
   */
  @Get(':flowId/nodes')
  async getFlowNodes(@Param('flowId') flowId: string) {
    try {
      const nodes = await this.prisma.flowNode.findMany({
        where: { flowId: flowId },
        include: {
          options: true,
          outgoingConnections: {
            include: {
              targetNode: true
            }
          }
        },
      });

      return nodes;
    } catch (error) {
      this.logger.error('Error fetching flow nodes:', error);
      throw error;
    }
  }

  /**
   * Atualizar nó
   */
  @Put(':flowId/nodes/:nodeId')
  async updateNode(
    @Param('flowId') flowId: string,
    @Param('nodeId') nodeId: string,
    @Body() updateData: {
      message?: string;
      nodeType?: 'MESSAGE' | 'OPTION' | 'INPUT' | 'CONDITION' | 'ACTION' | 'ESCALATION';
      active?: boolean;
      isStart?: boolean;
      isEnd?: boolean;
      position?: any;
    }
  ) {
    try {
      this.logger.log(`Updating node ${nodeId}:`, updateData);

      const node = await this.prisma.flowNode.update({
        where: { id: nodeId },
        data: updateData,
      });

      this.logger.log(`Node updated successfully: ${node.id}`);
      return node;
    } catch (error) {
      this.logger.error('Error updating node:', error);
      throw error;
    }
  }

  /**
   * Deletar nó
   */
  @Delete(':flowId/nodes/:nodeId')
  async deleteNode(@Param('flowId') flowId: string, @Param('nodeId') nodeId: string) {
    try {
      this.logger.log(`Deleting node: ${nodeId}`);

      await this.prisma.flowNode.delete({
        where: { id: nodeId },
      });

      this.logger.log(`Node deleted successfully: ${nodeId}`);
      return { success: true, message: 'Node deleted successfully' };
    } catch (error) {
      this.logger.error('Error deleting node:', error);
      throw error;
    }
  }

  /**
   * Criar opção para nó
   */
  @Post('nodes/:nodeId/options')
  async createNodeOption(
    @Param('nodeId') nodeId: string,
    @Body() optionData: { text: string; targetNodeId?: string }
  ) {
    try {
      this.logger.log(`Creating option for node ${nodeId}:`, optionData);

      const option = await this.prisma.flowOption.create({
        data: {
          nodeId: nodeId,
          text: optionData.text,
          order: 1,
          active: true,
        },
      });

      this.logger.log(`Option created successfully: ${option.id}`);
      return option;
    } catch (error) {
      this.logger.error('Error creating option:', error);
      throw error;
    }
  }

  /**
   * Buscar opções do nó
   */
  @Get('nodes/:nodeId/options')
  async getNodeOptions(@Param('nodeId') nodeId: string) {
    try {
      const options = await this.prisma.flowOption.findMany({
        where: { nodeId: nodeId },
      });

      return options;
    } catch (error) {
      this.logger.error('Error fetching node options:', error);
      throw error;
    }
  }

  /**
   * Atualizar opção
   */
  @Put('nodes/:nodeId/options/:optionId')
  async updateNodeOption(
    @Param('nodeId') nodeId: string,
    @Param('optionId') optionId: string,
    @Body() updateData: { text?: string; active?: boolean }
  ) {
    try {
      this.logger.log(`Updating option ${optionId}:`, updateData);

      const option = await this.prisma.flowOption.update({
        where: { id: optionId },
        data: updateData,
      });

      this.logger.log(`Option updated successfully: ${option.id}`);
      return option;
    } catch (error) {
      this.logger.error('Error updating option:', error);
      throw error;
    }
  }

  /**
   * Deletar opção
   */
  @Delete('nodes/:nodeId/options/:optionId')
  async deleteNodeOption(
    @Param('nodeId') nodeId: string,
    @Param('optionId') optionId: string
  ) {
    try {
      this.logger.log(`Deleting option: ${optionId}`);

      await this.prisma.flowOption.delete({
        where: { id: optionId },
      });

      this.logger.log(`Option deleted successfully: ${optionId}`);
      return { success: true, message: 'Option deleted successfully' };
    } catch (error) {
      this.logger.error('Error deleting option:', error);
      throw error;
    }
  }

  /**
   * Atualizar opção diretamente por ID (sem precisar do nodeId)
   */
  @Put('options/:optionId')
  async updateOption(
    @Param('optionId') optionId: string,
    @Body() updateData: { 
      text?: string; 
      targetNodeId?: string;
      active?: boolean 
    }
  ) {
    try {
      this.logger.log(`Updating option ${optionId}:`, updateData);

      const option = await this.prisma.flowOption.update({
        where: { id: optionId },
        data: updateData,
      });

      this.logger.log(`Option updated successfully: ${option.id}`);
      return option;
    } catch (error) {
      this.logger.error('Error updating option:', error);
      throw error;
    }
  }

  /**
   * Criar conexão entre nós
   */
  @Post(':flowId/connections')
  async createConnection(
    @Param('flowId') flowId: string,
    @Body() connectionData: {
      id?: string;
      sourceNodeId: string;
      targetNodeId: string;
      optionId?: string;
      condition?: string;
    }
  ) {
    try {
      this.logger.log(`Creating connection for flow ${flowId}:`, connectionData);

      const connection = await this.prisma.flowConnection.create({
        data: {
          id: connectionData.id || `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          sourceNodeId: connectionData.sourceNodeId,
          targetNodeId: connectionData.targetNodeId,
          optionId: connectionData.optionId,
          condition: connectionData.condition,
        },
      });

      this.logger.log(`Connection created successfully: ${connection.id}`);
      this.logger.log(`Connection details:`, {
        id: connection.id,
        sourceNodeId: connection.sourceNodeId,
        targetNodeId: connection.targetNodeId,
        optionId: connection.optionId,
        condition: connection.condition
      });
      return connection;
    } catch (error) {
      this.logger.error('Error creating connection:', error);
      throw error;
    }
  }

  /**
   * Buscar conexões de um flow
   */
  @Get(':flowId/connections')
  async getFlowConnections(@Param('flowId') flowId: string) {
    try {
      const connections = await this.prisma.flowConnection.findMany({
        where: {
          sourceNode: {
            flowId: flowId,
          },
        },
        include: {
          sourceNode: true,
          targetNode: true,
          option: true,
        },
      });

      return connections;
    } catch (error) {
      this.logger.error('Error fetching flow connections:', error);
      throw error;
    }
  }

  /**
   * Deletar conexão
   */
  @Delete('connections/:connectionId')
  async deleteConnection(@Param('connectionId') connectionId: string) {
    try {
      this.logger.log(`Deleting connection: ${connectionId}`);

      await this.prisma.flowConnection.delete({
        where: { id: connectionId },
      });

      this.logger.log(`Connection deleted successfully: ${connectionId}`);
      return { success: true, message: 'Connection deleted successfully' };
    } catch (error) {
      this.logger.error('Error deleting connection:', error);
      throw error;
    }
  }


  /**
   * Configurar targetNodeId das opções
   */
  @Post(':flowId/setup-options')
  async setupOptionsTargetNodes(@Param('flowId') flowId: string) {
    try {
      this.logger.log(`Setting up target nodes for flow ${flowId}`);

      // Buscar o fluxo com nós e opções
      const flow = await this.prisma.flow.findUnique({
        where: { id: flowId },
        include: {
          nodes: {
            include: {
              options: true
            }
          }
        }
      });

      if (!flow) {
        throw new Error('Flow not found');
      }

      const results: any[] = [];

      for (const node of flow.nodes) {
        if (node.options.length > 0) {
          this.logger.log(`Processing node: ${node.message} with ${node.options.length} options`);
          
          for (const option of node.options) {
            // Se a opção não tem targetNodeId, criar um nó de destino
            if (!option.targetNodeId) {
              // Criar um nó de destino que pode ter opções também
              const targetNode = await this.prisma.flowNode.create({
                data: {
                  flowId: flow.id,
                  title: `Você selecionou: ${option.text}. Como posso ajudá-lo?`,
                  message: `Você selecionou: ${option.text}. Como posso ajudá-lo?`,
                  nodeType: 'OPTION', // Próximo nó também pode ter opções
                  position: { x: 0, y: 0 },
                  active: true,
                  isStart: false
                }
              });
              
              // Criar opções para o nó de destino
              await this.prisma.flowOption.createMany({
                data: [
                  {
                    nodeId: targetNode.id,
                    text: 'Voltar ao menu principal',
                    order: 1,
                    active: true
                  },
                  {
                    nodeId: targetNode.id,
                    text: 'Falar com atendente',
                    order: 2,
                    active: true
                  },
                  {
                    nodeId: targetNode.id,
                    text: 'Finalizar conversa',
                    order: 3,
                    active: true
                  }
                ]
              });
              
              // Atualizar a opção com o targetNodeId
              await this.prisma.flowOption.update({
                where: { id: option.id },
                data: { targetNodeId: targetNode.id }
              });
              
              results.push({
                optionId: option.id,
                optionText: option.text,
                targetNodeId: targetNode.id,
                targetNodeMessage: targetNode.message
              });
              
              this.logger.log(`✅ Created target node with options for: ${option.text}`);
            } else {
              this.logger.log(`✅ Option already has targetNodeId: ${option.text}`);
            }
          }
        }
      }

      return {
        success: true,
        message: `Setup ${results.length} option target nodes`,
        results
      };

    } catch (error) {
      this.logger.error('Error setting up option target nodes:', error);
      throw error;
    }
  }

  /**
   * Corrigir conexões do fluxo
   */
  @Post(':flowId/fix-connections')
  async fixFlowConnections(@Param('flowId') flowId: string) {
    try {
      this.logger.log(`Fixing connections for flow ${flowId}`);

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
        throw new Error('Flow not found');
      }

      const results: any[] = [];

      for (const node of flow.nodes) {
        this.logger.log(`Processing node: ${node.message} (${node.nodeType})`);
        
        // Se o nó tem opções mas não tem conexões, criar conexões
        if (node.options.length > 0 && node.outgoingConnections.length === 0) {
          this.logger.log(`Node has ${node.options.length} options but no connections`);
          
          for (const option of node.options) {
            // Verificar se já existe conexão para esta opção
            const existingConnection = await this.prisma.flowConnection.findFirst({
              where: {
                sourceNodeId: node.id,
                optionId: option.id
              }
            });
            
            if (!existingConnection) {
              // Criar um nó de destino para esta opção
              const targetNode = await this.prisma.flowNode.create({
                data: {
                  flowId: flow.id,
                  title: `Resposta para: ${option.text}`,
                  message: `Resposta para: ${option.text}`,
                  nodeType: 'MESSAGE',
                  position: { x: 0, y: 0 },
                  active: true,
                  isStart: false
                }
              });
              
              // Criar conexão
              const connection = await this.prisma.flowConnection.create({
                data: {
                  sourceNodeId: node.id,
                  targetNodeId: targetNode.id,
                  optionId: option.id,
                  active: true
                }
              });
              
              results.push({
                nodeId: node.id,
                optionId: option.id,
                optionText: option.text,
                targetNodeId: targetNode.id,
                connectionId: connection.id
              });
            }
          }
        }
      }

      return {
        success: true,
        message: `Fixed ${results.length} connections`,
        results
      };

    } catch (error) {
      this.logger.error('Error fixing flow connections:', error);
      throw error;
    }
  }
}