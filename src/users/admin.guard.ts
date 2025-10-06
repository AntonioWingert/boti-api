import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const token = request.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      throw new ForbiddenException('Token not provided');
    }

    try {
      const payload = this.jwtService.verify(token);
      
      if (payload.role !== 'ADMIN') {
        throw new ForbiddenException('Admin access required');
      }
      
      return true;
    } catch (error) {
      throw new ForbiddenException('Invalid token or insufficient permissions');
    }
  }
}
