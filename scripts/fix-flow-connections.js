const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function fixFlowConnections() {
  try {
    console.log('🔍 Verificando fluxos e conexões...');
    
    // Buscar todos os fluxos
    const flows = await prisma.flow.findMany({
      include: {
        nodes: {
          include: {
            options: true,
            outgoingConnections: true
          }
        }
      }
    });
    
    console.log(`📊 Encontrados ${flows.length} fluxos`);
    
    for (const flow of flows) {
      console.log(`\n🔍 Analisando fluxo: ${flow.name} (${flow.id})`);
      console.log(`📝 Nós: ${flow.nodes.length}`);
      
      for (const node of flow.nodes) {
        console.log(`  📍 Nó: ${node.message} (${node.nodeType})`);
        console.log(`    🔗 Conexões de saída: ${node.outgoingConnections.length}`);
        console.log(`    ⚙️ Opções: ${node.options.length}`);
        
        // Se o nó tem opções mas não tem conexões, criar conexões
        if (node.options.length > 0 && node.outgoingConnections.length === 0) {
          console.log(`    ⚠️ Nó tem opções mas não tem conexões!`);
          
          // Para cada opção, criar um nó de destino se não existir
          for (const option of node.options) {
            console.log(`      🔧 Processando opção: ${option.text}`);
            
            // Verificar se já existe um nó de destino para esta opção
            const existingConnection = await prisma.flowConnection.findFirst({
              where: {
                sourceNodeId: node.id,
                optionId: option.id
              }
            });
            
            if (!existingConnection) {
              // Criar um nó de destino para esta opção
              const targetNode = await prisma.flowNode.create({
                data: {
                  flowId: flow.id,
                  message: `Resposta para: ${option.text}`,
                  nodeType: 'MESSAGE',
                  active: true,
                  isStart: false
                }
              });
              
              // Criar conexão
              await prisma.flowConnection.create({
                data: {
                  sourceNodeId: node.id,
                  targetNodeId: targetNode.id,
                  optionId: option.id,
                  active: true
                }
              });
              
              console.log(`      ✅ Criado nó de destino e conexão para: ${option.text}`);
            } else {
              console.log(`      ✅ Conexão já existe para: ${option.text}`);
            }
          }
        }
      }
    }
    
    console.log('\n🎉 Verificação e correção concluída!');
    
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixFlowConnections();
