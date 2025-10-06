import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // 1. Criar empresa padrão
  console.log('📊 Creating default company...');
  const company = await prisma.company.upsert({
    where: { email: 'contato@empresateste.com' },
    update: {},
    create: {
      name: 'Empresa Teste',
      email: 'contato@empresateste.com',
      phone: '11999999999',
      address: 'Rua Teste, 123 - São Paulo, SP',
      active: true,
      
      // Sistema de Planos
      planType: 'FREE_TRIAL',
      trialStartDate: new Date(),
      trialEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 dias
      isTrialActive: true,
      trialUsed: false,
      
      // Limites de recursos (trial)
      maxUsers: 2,
      maxConnections: 1,
      maxChatbots: 1,
      maxDisparos: 5000,
      maxDisparosDiarios: 200,
      maxClients: 2000,
      
      // Controle de uso atual
      currentUsers: 0,
      currentConnections: 0,
      currentChatbots: 0,
      currentDisparos: 0,
      currentDisparosDiarios: 0,
      currentClients: 0,
      lastDisparoReset: new Date(),
      
      // Recursos Premium (trial)
      hasAdvancedAnalytics: false,
      hasCustomBranding: false,
      hasSSO: false,
      hasAPI: false,
      
      // Billing
      monthlyPrice: 0.00,
      billingCycle: 'MONTHLY',
      nextBilling: null,
      isActive: true,
    },
  });
  console.log('✅ Company created:', company.name);

  // 2. Criar usuário de teste
  console.log('👤 Creating test user...');
  const hashedPassword = await bcrypt.hash('test123', 10);
  const user = await prisma.user.upsert({
    where: { email: 'admin@teste.com' },
    update: {},
    create: {
      name: 'Admin Teste',
      email: 'admin@teste.com',
      password: hashedPassword,
      role: 'ADMIN',
      active: true,
      companyId: company.id,
    },
  });
  console.log('✅ User created:', user.email);

  // 3. Criar cliente de teste
  console.log('👥 Creating test client...');
  const client = await prisma.client.upsert({
    where: { phone: '5511999999999' },
    update: {},
    create: {
      name: 'Cliente Teste',
      phone: '5511999999999',
      email: 'cliente@teste.com',
      active: true,
      companyId: company.id,
    },
  });
  console.log('✅ Client created:', client.name);

  // 4. Criar chatbot de teste
  console.log('🤖 Creating test chatbot...');
  const chatbot = await prisma.chatbot.create({
    data: {
      name: 'Chatbot de Vendas',
      description: 'Chatbot para atendimento e vendas',
      active: true,
      autoEndMessage: 'Obrigado pelo contato! Nossa equipe entrará em contato em breve.',
      companyId: company.id,
    },
  });
  console.log('✅ Chatbot created:', chatbot.name);

  // 5. Criar fluxo de teste
  console.log('🔄 Creating test flow...');
  const flow = await prisma.flow.create({
    data: {
      name: 'Fluxo de Boas-vindas',
      description: 'Fluxo inicial de atendimento',
      active: true,
      isDefault: true,
      chatbotId: chatbot.id,
    },
  });
  console.log('✅ Flow created:', flow.name);

  // 6. Criar nós do fluxo
  console.log('📝 Creating flow nodes...');
  const startNode = await prisma.flowNode.create({
    data: {
      title: 'Boas-vindas',
      message: 'Olá! Bem-vindo à nossa empresa. Como posso ajudá-lo hoje?',
      nodeType: 'OPTION',
      position: { x: 100, y: 100 },
      isStart: true,
      isEnd: false,
      active: true,
      flowId: flow.id,
    },
  });

  const optionNode = await prisma.flowNode.create({
    data: {
      title: 'Informações',
      message: 'Aqui estão nossas principais informações:',
      nodeType: 'MESSAGE',
      position: { x: 300, y: 100 },
      isStart: false,
      isEnd: false,
      active: true,
      flowId: flow.id,
    },
  });

  const endNode = await prisma.flowNode.create({
    data: {
      title: 'Finalização',
      message: 'Obrigado pelo contato! Nossa equipe entrará em contato em breve.',
      nodeType: 'MESSAGE',
      position: { x: 500, y: 100 },
      isStart: false,
      isEnd: true,
      active: true,
      flowId: flow.id,
    },
  });

  // 7. Criar opções do fluxo
  await prisma.flowOption.createMany({
    data: [
      {
        text: 'Quero informações sobre produtos',
        order: 1,
        actionType: 'message',
        targetNodeId: optionNode.id,
        nodeId: startNode.id,
      },
      {
        text: 'Falar com atendente',
        order: 2,
        actionType: 'transfer',
        transferMessage: 'Transferindo para nosso atendente...',
        nodeId: startNode.id,
      },
      {
        text: 'Finalizar conversa',
        order: 3,
        actionType: 'message',
        targetNodeId: endNode.id,
        nodeId: startNode.id,
      },
    ],
  });

  console.log('✅ Flow nodes and options created');

  // 8. Criar sessão WhatsApp de teste
  console.log('📱 Creating WhatsApp session...');
  const whatsappSession = await prisma.whatsAppSession.create({
    data: {
      sessionName: 'teste-session',
      phoneNumber: null,
      status: 'DISCONNECTED',
      qrCode: null,
      lastSeen: null,
      error: null,
      active: true,
      companyId: company.id,
    },
  });
  console.log('✅ WhatsApp session created:', whatsappSession.sessionName);

  // 9. Criar disparo de teste
  console.log('📤 Creating test disparo...');
  const disparo = await prisma.disparo.create({
    data: {
      title: 'Campanha de Boas-vindas',
      message: 'Olá! Bem-vindo à nossa empresa. Estamos aqui para ajudá-lo!',
      type: 'PROMOCIONAL',
      status: 'AGENDADO',
      scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000), // Amanhã
      sendInterval: 5,
      companyId: company.id,
    },
  });

  // 10. Criar destinatários do disparo
  await prisma.disparoDestinatario.createMany({
    data: [
      {
        name: 'Cliente Teste 1',
        phone: '5511999999999',
        status: 'PENDENTE',
        disparoId: disparo.id,
      },
      {
        name: 'Cliente Teste 2',
        phone: '5511888888888',
        status: 'PENDENTE',
        disparoId: disparo.id,
      },
    ],
  });

  console.log('✅ Disparo created:', disparo.title);

  // 11. Atualizar contadores da empresa
  await prisma.company.update({
    where: { id: company.id },
    data: {
      currentUsers: 1,
      currentChatbots: 1,
      currentClients: 1,
    },
  });

  console.log('🎉 Database seeding completed successfully!');
  console.log('\n📋 Test Data Summary:');
  console.log(`🏢 Company: ${company.name} (${company.id}) - Plan: ${company.planType}`);
  console.log(`👤 User: ${user.name} (${user.email}) - Password: test123`);
  console.log(`👥 Client: ${client.name} (${client.phone})`);
  console.log(`🤖 Chatbot: ${chatbot.name} (${chatbot.id})`);
  console.log(`🔄 Flow: ${flow.name} (${flow.id})`);
  console.log(`📱 WhatsApp Session: ${whatsappSession.sessionName} (${whatsappSession.id})`);
  console.log(`📤 Disparo: ${disparo.title} (${disparo.id})`);
 
  console.log('\n🔑 Test Token Generation:');
  console.log('POST http://localhost:3000/users/generate-test-token');
  console.log('This will generate a JWT token for testing protected routes.');
  
  console.log('\n📱 WhatsApp Testing:');
  console.log('POST http://localhost:3000/whatsapp/sessions/connect-baileys');
  console.log('Use the generated token in Authorization header: Bearer <token>');
  
  console.log('\n🤖 Chatbot Testing:');
  console.log('GET http://localhost:3000/chatbots');
  console.log('GET http://localhost:3000/flow');
  
  console.log('\n📤 Disparos Testing:');
  console.log('GET http://localhost:3000/disparos');
  console.log('POST http://localhost:3000/disparos');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
