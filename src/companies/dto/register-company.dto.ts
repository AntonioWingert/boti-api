import { 
  IsString, 
  IsEmail, 
  IsOptional, 
  IsBoolean, 
  IsNotEmpty, 
  MinLength, 
  IsEnum,
  IsPhoneNumber,
  ValidateNested,
  IsObject
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterCompanyUserDto {
  @ApiProperty({ 
    description: 'Nome do usuário administrador',
    example: 'João Silva',
    minLength: 2
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name: string;

  @ApiProperty({ 
    description: 'Email do usuário administrador',
    example: 'joao@empresa.com'
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ 
    description: 'Senha do usuário administrador',
    example: 'senha123',
    minLength: 6
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;
}

export class RegisterCompanyDto {
  @ApiProperty({ 
    description: 'Nome da empresa',
    example: 'Empresa ABC Ltda',
    minLength: 2
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name: string;

  @ApiProperty({ 
    description: 'Email da empresa',
    example: 'contato@empresa.com'
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiPropertyOptional({ 
    description: 'Telefone da empresa',
    example: '11999999999'
  })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ 
    description: 'Endereço da empresa',
    example: 'Rua das Flores, 123 - São Paulo, SP'
  })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiProperty({ 
    description: 'Dados do usuário administrador',
    type: RegisterCompanyUserDto
  })
  @ValidateNested()
  @Type(() => RegisterCompanyUserDto)
  @IsObject()
  user: RegisterCompanyUserDto;

  @ApiPropertyOptional({ 
    description: 'Tipo de plano inicial',
    enum: ['FREE_TRIAL', 'FREE', 'STARTER'],
    default: 'FREE_TRIAL'
  })
  @IsEnum(['FREE_TRIAL', 'FREE', 'STARTER'])
  @IsOptional()
  planType?: 'FREE_TRIAL' | 'FREE' | 'STARTER';

  @ApiPropertyOptional({ 
    description: 'Se deve iniciar trial automaticamente',
    default: true
  })
  @IsBoolean()
  @IsOptional()
  startTrial?: boolean;
}
