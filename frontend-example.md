# 🎨 Frontend Integration - Gerenciamento de IDs

## 📋 **Estratégias para IDs no Frontend**

### **1. Geração de IDs no Frontend**

```typescript
// utils/idGenerator.ts
export const generateId = (prefix: string = '') => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9);
  return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`;
};

// Exemplos de uso
const nodeId = generateId('node');        // 'node_1699123456789_abc123def'
const optionId = generateId('option');    // 'option_1699123456789_xyz789ghi'
const connectionId = generateId('conn');  // 'conn_1699123456789_mno456jkl'
```

### **2. API Calls do Frontend**

```typescript
// services/flowService.ts
class FlowService {
  private baseUrl = 'http://localhost:3000/flows';

  // Criar novo nó
  async createNode(flowId: string, nodeData: any) {
    const response = await fetch(`${this.baseUrl}/${flowId}/nodes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.getToken()}`
      },
      body: JSON.stringify({
        id: generateId('node'), // ID gerado no frontend
        ...nodeData
      })
    });
    return response.json();
  }

  // Criar nova opção
  async createOption(nodeId: string, optionData: any) {
    const response = await fetch(`${this.baseUrl}/nodes/${nodeId}/options`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.getToken()}`
      },
      body: JSON.stringify({
        id: generateId('option'), // ID gerado no frontend
        ...optionData
      })
    });
    return response.json();
  }

  // Criar conexão
  async createConnection(connectionData: any) {
    const response = await fetch(`${this.baseUrl}/connections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.getToken()}`
      },
      body: JSON.stringify({
        id: generateId('conn'), // ID gerado no frontend
        ...connectionData
      })
    });
    return response.json();
  }

  // Buscar fluxo completo
  async getCompleteFlow(flowId: string) {
    const response = await fetch(`${this.baseUrl}/${flowId}/complete`, {
      headers: {
        'Authorization': `Bearer ${this.getToken()}`
      }
    });
    return response.json();
  }
}
```

### **3. Exemplo de Uso no React**

```tsx
// components/FlowBuilder.tsx
import React, { useState, useEffect } from 'react';
import { FlowService } from '../services/flowService';

const FlowBuilder = ({ flowId }: { flowId: string }) => {
  const [flow, setFlow] = useState(null);
  const flowService = new FlowService();

  // Carregar fluxo existente
  useEffect(() => {
    loadFlow();
  }, [flowId]);

  const loadFlow = async () => {
    try {
      const flowData = await flowService.getCompleteFlow(flowId);
      setFlow(flowData);
    } catch (error) {
      console.error('Error loading flow:', error);
    }
  };

  // Adicionar novo nó
  const addNode = async (position: { x: number; y: number }) => {
    try {
      const newNode = await flowService.createNode(flowId, {
        title: 'Novo Nó',
        message: 'Digite sua mensagem aqui',
        nodeType: 'MESSAGE',
        position: position,
        isStart: false,
        isEnd: false
      });
      
      // Atualizar estado local
      setFlow(prev => ({
        ...prev,
        nodes: [...prev.nodes, newNode]
      }));
    } catch (error) {
      console.error('Error creating node:', error);
    }
  };

  // Adicionar opção a um nó
  const addOption = async (nodeId: string) => {
    try {
      const newOption = await flowService.createOption(nodeId, {
        text: 'Nova Opção',
        order: 1
      });
      
      // Atualizar estado local
      setFlow(prev => ({
        ...prev,
        nodes: prev.nodes.map(node => 
          node.id === nodeId 
            ? { ...node, options: [...node.options, newOption] }
            : node
        )
      }));
    } catch (error) {
      console.error('Error creating option:', error);
    }
  };

  // Conectar nós
  const connectNodes = async (sourceNodeId: string, targetNodeId: string, optionId?: string) => {
    try {
      const connection = await flowService.createConnection({
        sourceNodeId,
        targetNodeId,
        optionId
      });
      
      // Atualizar estado local
      setFlow(prev => ({
        ...prev,
        connections: [...prev.connections, connection]
      }));
    } catch (error) {
      console.error('Error creating connection:', error);
    }
  };

  return (
    <div className="flow-builder">
      {/* Interface do construtor de fluxo */}
      <div className="nodes-container">
        {flow?.nodes?.map(node => (
          <div key={node.id} className="node" style={{ left: node.position.x, top: node.position.y }}>
            <h3>{node.title}</h3>
            <p>{node.message}</p>
            <div className="options">
              {node.options?.map(option => (
                <div key={option.id} className="option">
                  {option.text}
                </div>
              ))}
              <button onClick={() => addOption(node.id)}>
                + Adicionar Opção
              </button>
            </div>
          </div>
        ))}
      </div>
      
      <button onClick={() => addNode({ x: Math.random() * 400, y: Math.random() * 300 })}>
        + Adicionar Nó
      </button>
    </div>
  );
};

export default FlowBuilder;
```

## 🔧 **Vantagens desta Abordagem**

### **✅ Frontend Controla IDs:**
- **Previsibilidade:** IDs são gerados antes de enviar para API
- **Otimização:** Pode atualizar UI imediatamente
- **Consistência:** Mesmo padrão de nomenclatura

### **✅ Backend Valida:**
- **Segurança:** Valida dados antes de salvar
- **Integridade:** Verifica relacionamentos
- **Logs:** Registra todas as operações

### **✅ Sincronização:**
- **Estado Local:** Frontend mantém estado otimista
- **Sincronização:** Atualiza quando API confirma
- **Rollback:** Pode reverter em caso de erro

## 🚀 **Próximos Passos**

1. **Testar APIs** - Verificar se endpoints funcionam
2. **Implementar Frontend** - Criar interface de construção
3. **Validações** - Adicionar validações de negócio
4. **Real-time** - WebSocket para colaboração

**Quer que eu teste as APIs criadas?** 🎯

