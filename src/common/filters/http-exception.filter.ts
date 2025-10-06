import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Erro interno do servidor';
    let details: any = null;

    // Log do erro para debug
    this.logger.error('Exception caught:', exception);

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const responseObj = exceptionResponse as any;
        message = responseObj.message || responseObj.error || message;
        details = responseObj.details || null;
      }
    } else if (exception instanceof Error) {
      // Tratar erros específicos do Prisma
      if (exception.message.includes('Unique constraint failed')) {
        status = HttpStatus.CONFLICT;
        message = 'Dados já existem no sistema';
        details = {
          suggestion: 'Verifique se os dados já não foram cadastrados anteriormente'
        };
      } else if (exception.message.includes('Record to update not found')) {
        status = HttpStatus.NOT_FOUND;
        message = 'Registro não encontrado';
        details = {
          suggestion: 'Verifique se o ID fornecido está correto'
        };
      } else if (exception.message.includes('Email já está em uso')) {
        status = HttpStatus.CONFLICT;
        message = 'Este email já está sendo usado por outro usuário';
        details = {
          field: 'email',
          suggestion: 'Use um email diferente ou faça login se já possui uma conta'
        };
      } else if (exception.message.includes('Já existe uma solicitação pendente')) {
        status = HttpStatus.CONFLICT;
        message = 'Já existe uma solicitação pendente para este email';
        details = {
          field: 'email',
          suggestion: 'Aguarde a aprovação da solicitação anterior ou entre em contato com o suporte'
        };
      } else if (exception.message.includes('Solicitação já foi processada')) {
        status = HttpStatus.BAD_REQUEST;
        message = 'Esta solicitação já foi processada anteriormente';
        details = {
          suggestion: 'Verifique o status atual da solicitação'
        };
      } else {
        message = exception.message;
        details = {
          suggestion: 'Tente novamente ou entre em contato com o suporte'
        };
      }
    }

    const errorResponse = {
      success: false,
      error: {
        statusCode: status,
        message,
        details,
        timestamp: new Date().toISOString(),
        path: request.url,
        method: request.method,
      },
    };

    // Log da resposta de erro
    this.logger.error(`Error response: ${JSON.stringify(errorResponse)}`);

    response.status(status).json(errorResponse);
  }
}
