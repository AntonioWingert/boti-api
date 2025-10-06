import { IsString, IsOptional, IsBoolean, IsNotEmpty, MinLength, IsObject } from 'class-validator';

export class CreateChatbotDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  active?: boolean;

  @IsString()
  @IsOptional()
  autoEndMessage?: string; // Mensagem automática de finalização

  @IsString()
  @IsNotEmpty()
  companyId: string;
}
