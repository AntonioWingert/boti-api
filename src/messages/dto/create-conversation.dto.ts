import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';
import { ConversationStatus, Priority } from '@prisma/client';

export class CreateConversationDto {
  @IsString()
  @IsNotEmpty()
  companyId: string;

  @IsString()
  @IsNotEmpty()
  clientId: string;

  @IsString()
  @IsOptional()
  chatbotId?: string;

  @IsString()
  @IsOptional()
  userId?: string;

  @IsEnum(ConversationStatus)
  @IsOptional()
  status?: ConversationStatus;

  @IsEnum(Priority)
  @IsOptional()
  priority?: Priority;

  @IsOptional()
  escalated?: boolean;
}
