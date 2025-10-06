import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChatbotResponse } from './whatsapp-response.service';

@Injectable()
export class ChatbotFlowService {
  private readonly logger = new Logger(ChatbotFlowService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Processa uma mensagem no fluxo do chatbot
   * @param conversationId ID da conversa
   * @param messageText Texto da mensagem recebida
   * @param phoneNumber Número do telefone
   */
  async processMessage(conversationId: string, messageText: string, phoneNumber: string): Promise<ChatbotResponse> {
    try {
      // 1. Buscar conversa com fluxo atual
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          currentFlow: {
            include: {
              nodes: {
                include: {
                  options: {
                    include: {
                      connection: {
                        include: {
                          targetNode: true
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          currentNode: {
            include: {
              options: {
                include: {
                  connection: {
                    include: {
                      targetNode: true
                    }
                  }
                }
              },
              outgoingConnections: {
                include: {
                  targetNode: true
                }
              }
            }
          }
        }
      });

      if (!conversation?.currentFlow || !conversation?.currentNode) {
        return this.getDefaultResponse();
      }

      // 2. Processar mensagem no nó atual
      this.logger.log(`🔍 Processing message in node: ${conversation.currentNode.id} (${conversation.currentNode.nodeType})`);
      const response = await this.processNodeMessage(
        conversation.currentNode,
        messageText,
        phoneNumber
      );

      // 3. Determinar próximo nó
      const nextNode = await this.determineNextNode(
        conversation.currentNode,
        messageText
      );

      // 4. Lógica extra: Se é um nó MESSAGE e tem próximo nó OPTION, navegar automaticamente
      if (conversation.currentNode.nodeType === 'MESSAGE' && nextNode?.nodeType === 'OPTION') {
        this.logger.log(`🔄 Auto-navigating from MESSAGE to OPTION node: ${nextNode.id}`);
        
        // Atualizar conversa para o nó de opções
        await this.prisma.conversation.update({
          where: { id: conversationId },
          data: {
            currentNodeId: nextNode.id,
            updatedAt: new Date()
          }
        });

        // Processar o nó de opções para gerar resposta com opções
        const optionResponse = await this.processNodeMessage(
          nextNode,
          messageText,
          phoneNumber
        );

        this.logger.log(`✅ Generated option response:`, {
          text: optionResponse.text,
          type: optionResponse.type,
          optionsCount: optionResponse.options?.length || optionResponse.buttons?.length || 0
        });

        return optionResponse;
      }

      // 5. Atualizar conversa (sem salvar mensagem)
      if (nextNode) {
        this.logger.log(`🔄 Updating conversation to next node: ${nextNode.id} (${nextNode.nodeType})`);
        await this.prisma.conversation.update({
          where: { id: conversationId },
          data: {
            currentNodeId: nextNode.id,
            updatedAt: new Date()
          }
        });
      } else {
        this.logger.log(`⚠️ No next node found, staying on current node: ${conversation.currentNode.id}`);
      }

      this.logger.log(`✅ Final response:`, {
        text: response.text,
        type: response.type,
        optionsCount: response.options?.length || response.buttons?.length || 0
      });

      return response;

    } catch (error) {
      this.logger.error('Error processing chatbot flow:', error);
      return this.getDefaultResponse();
    }
  }

  /**
   * Processa mensagem no nó atual
   */
  private async processNodeMessage(node: any, messageText: string, phoneNumber: string): Promise<ChatbotResponse> {
    const nodeType = node.nodeType;
    
    switch (nodeType) {
      case 'MESSAGE':
        return {
          text: node.message,
          type: 'text'
        };

      case 'OPTION':
        this.logger.log(`🔍 Processing OPTION node:`, {
          message: node.message,
          optionsCount: (node.options || []).length,
          options: (node.options || []).map(o => ({ id: o.id, text: o.text }))
        });
        
        return {
          text: node.message,
          type: 'template',
          template: {
            name: 'chatbot_options',
            language: {
              code: 'pt_BR'
            },
            components: [
              {
                type: 'BODY',
                parameters: [
                  {
                    type: 'text',
                    text: node.message
                  }
                ]
              },
              {
                type: 'BUTTONS',
                parameters: (node.options || []).map((option, index) => ({
                  type: 'payload',
                  payload: `option_${option.id}_${index + 1}`
                })),
                sub_type: 'QUICK_REPLY',
                index: '0'
              }
            ]
          },
          buttons: (node.options || []).map((option, index) => ({
            id: option.id,
            text: option.text,
            payload: `option_${option.id}_${index + 1}`
          }))
        };

      case 'INPUT':
        return {
          text: node.message,
          type: 'text'
        };

      case 'CONDITION':
        return this.processConditionNode(node, messageText);

      case 'ACTION':
        return this.processActionNode(node, messageText, phoneNumber);

      case 'ESCALATION':
        return this.processEscalationNode(node, phoneNumber);

      default:
        return {
          text: node.message || 'Como posso ajudar?',
          type: 'text'
        };
    }
  }

  /**
   * Determina o próximo nó baseado na mensagem
   */
  private async determineNextNode(currentNode: any, messageText: string) {
    this.logger.log(`🔍 Determining next node for message: "${messageText}"`);
    this.logger.log(`🔍 Current node type: ${currentNode.nodeType}`);
    this.logger.log(`🔍 Current node options:`, (currentNode.options || []).map(o => ({ id: o.id, text: o.text })));
    this.logger.log(`🔍 Current node outgoingConnections:`, (currentNode.outgoingConnections || []).map(c => ({ 
      id: c.id, 
      sourceNodeId: c.sourceNodeId, 
      targetNodeId: c.targetNodeId,
      optionId: c.optionId,
      condition: c.condition
    })));
    
    // Se é um nó de opções, verificar se a mensagem corresponde a uma opção
    if (currentNode.nodeType === 'OPTION' || (currentNode.options && currentNode.options.length > 0)) {
      // Primeiro, verificar se é um payload de botão (option_id_1, option_id_2, etc.)
      let selectedOption: any = null;
      
      if (messageText.startsWith('option_')) {
        // É um payload de botão - extrair ID da opção
        const optionId = messageText.split('_')[1];
        selectedOption = (currentNode.options || []).find(option => option.id === optionId);
        this.logger.log(`🔘 User clicked button: ${messageText} -> ${selectedOption?.text}`);
      } else {
        // Tentar correspondência por número (1, 2, 3, etc.)
        const optionNumber = parseInt(messageText.trim());
        
        if (!isNaN(optionNumber) && optionNumber > 0 && optionNumber <= (currentNode.options || []).length) {
          // Usuário digitou um número - pegar a opção correspondente
          selectedOption = (currentNode.options || [])[optionNumber - 1];
          this.logger.log(`🔢 User selected option by number: ${optionNumber} -> ${selectedOption?.text}`);
        } else {
          // Tentar correspondência por texto
          selectedOption = (currentNode.options || []).find(option => 
            option.text.toLowerCase() === messageText.toLowerCase() ||
            option.text.toLowerCase().includes(messageText.toLowerCase())
          );
          this.logger.log(`🔤 User selected option by text: "${messageText}" -> ${selectedOption?.text}`);
        }
      }
      
      this.logger.log(`🔍 Selected option:`, selectedOption ? { id: selectedOption.id, text: selectedOption.text, targetNodeId: selectedOption.targetNodeId } : 'None');

      // Se encontrou uma opção correspondente, navegar para o nó de destino
      if (selectedOption?.targetNodeId) {
        this.logger.log(`🔍 Option has targetNodeId: ${selectedOption.targetNodeId}`);
        // Buscar o nó de destino
        const targetNode = await this.prisma.flowNode.findUnique({
          where: { id: selectedOption.targetNodeId }
        });
        
        if (targetNode) {
          this.logger.log(`✅ Option ${selectedOption.id} leads to target node: ${targetNode.id}`);
          return targetNode;
        } else {
          this.logger.warn(`❌ Target node not found: ${selectedOption.targetNodeId}`);
        }
      }
      
      // Fallback para conexão tradicional (se ainda existir)
      if (selectedOption?.connection?.targetNode) {
        this.logger.log(`✅ Using connection target node: ${selectedOption.connection.targetNode.id}`);
        return selectedOption.connection.targetNode;
      }
      
      // Se não encontrou correspondência exata, mas o nó tem opções, 
      // mostrar as opções disponíveis e manter no mesmo nó
      if (currentNode.options?.length > 0) {
        this.logger.log(`🔍 No exact match found, staying on current node with options`);
        this.logger.log(`⚠️ No next node found, staying on current node: ${currentNode.id}`);
        return null; // Manter no mesmo nó para mostrar opções
      }
    }


    // Se é um nó de entrada, verificar conexões condicionais
    if (currentNode.nodeType === 'INPUT') {
      const connection = currentNode.outgoingConnections?.find(conn => 
        this.evaluateCondition(conn.condition, messageText)
      );

      if (connection?.targetNode) {
        return connection.targetNode;
      }
    }

    // Buscar próxima conexão padrão
    const defaultConnection = currentNode.outgoingConnections?.find(conn => 
      !conn.condition
    );

    this.logger.log(`🔍 Default connection:`, defaultConnection ? { id: defaultConnection.id, targetNode: defaultConnection.targetNode?.id } : 'None');
    const result = defaultConnection?.targetNode || null;
    this.logger.log(`🔍 Final next node result:`, result ? { id: result.id, type: result.nodeType } : 'null');
    
    return result;
  }

  /**
   * Avalia condição para navegação
   */
  private evaluateCondition(condition: string, messageText: string): boolean {
    if (!condition) return true;

    // Implementar lógica de condições
    // Exemplo: "contains:ajuda" ou "equals:sim"
    if (condition.startsWith('contains:')) {
      const keyword = condition.replace('contains:', '');
      return messageText.toLowerCase().includes(keyword.toLowerCase());
    }

    if (condition.startsWith('equals:')) {
      const value = condition.replace('equals:', '');
      return messageText.toLowerCase() === value.toLowerCase();
    }

    return false;
  }

  /**
   * Processa nó de condição
   */
  private processConditionNode(node: any, messageText: string): ChatbotResponse {
    // Lógica para nó de condição
    return {
      text: node.message,
      type: 'text'
    };
  }

  /**
   * Processa nó de ação
   */
  private processActionNode(node: any, messageText: string, phoneNumber: string): ChatbotResponse {
    // Lógica para nó de ação (ex: enviar email, criar ticket)
    return {
      text: node.message,
      type: 'text'
    };
  }

  /**
   * Processa nó de escalação
   */
  private processEscalationNode(node: any, phoneNumber: string): ChatbotResponse {
    // Lógica para escalação para humano
    return {
      text: 'Sua conversa foi transferida para um atendente humano. Aguarde um momento.',
      type: 'text'
    };
  }

  /**
   * Resposta padrão quando não há fluxo configurado
   */
  private getDefaultResponse(): ChatbotResponse {
    return {
      text: 'Olá! Como posso ajudar você hoje?',
      type: 'text'
    };
  }
}
