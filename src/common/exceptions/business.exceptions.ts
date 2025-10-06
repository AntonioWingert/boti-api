import { HttpException, HttpStatus } from '@nestjs/common';

export class EmailAlreadyExistsException extends HttpException {
  constructor(email: string) {
    super(
      {
        message: 'Este email já está sendo usado',
        details: {
          field: 'email',
          value: email,
          suggestion: 'Use um email diferente ou faça login se já possui uma conta',
        },
      },
      HttpStatus.CONFLICT,
    );
  }
}

export class PendingRequestExistsException extends HttpException {
  constructor(email: string) {
    super(
      {
        message: 'Já existe uma solicitação pendente para este email',
        details: {
          field: 'email',
          value: email,
          suggestion: 'Aguarde a aprovação da solicitação anterior ou entre em contato com o suporte',
        },
      },
      HttpStatus.CONFLICT,
    );
  }
}

export class CompanyAlreadyExistsException extends HttpException {
  constructor(email: string) {
    super(
      {
        message: 'Já existe uma empresa cadastrada com este email',
        details: {
          field: 'companyEmail',
          value: email,
          suggestion: 'Use um email diferente para a empresa ou entre em contato com o suporte',
        },
      },
      HttpStatus.CONFLICT,
    );
  }
}

export class RequestAlreadyProcessedException extends HttpException {
  constructor(requestId: string, status: string) {
    super(
      {
        message: 'Esta solicitação já foi processada',
        details: {
          requestId,
          currentStatus: status,
          suggestion: 'Verifique o status atual da solicitação',
        },
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class InvalidPlanTypeException extends HttpException {
  constructor(planType: string) {
    super(
      {
        message: 'Tipo de plano inválido',
        details: {
          field: 'planType',
          value: planType,
          validOptions: ['FREE_TRIAL', 'FREE', 'STARTER'],
          suggestion: 'Escolha um dos planos disponíveis',
        },
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class ValidationFailedException extends HttpException {
  constructor(errors: any[]) {
    super(
      {
        message: 'Dados inválidos fornecidos',
        details: {
          errors: errors.map(error => ({
            field: error.property,
            value: error.value,
            message: error.constraints,
            suggestion: this.getSuggestion(error.property, error.constraints),
          })),
        },
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  private getSuggestion(field: string, constraints: any): string {
    const suggestions: { [key: string]: string } = {
      email: 'Use um formato de email válido (ex: usuario@empresa.com)',
      password: 'A senha deve ter pelo menos 6 caracteres',
      name: 'O nome deve ter pelo menos 2 caracteres',
      companyName: 'O nome da empresa deve ter pelo menos 2 caracteres',
      phone: 'Use um formato de telefone válido (ex: 11999999999)',
    };
    
    return suggestions[field] || 'Verifique o formato do campo';
  }
}
