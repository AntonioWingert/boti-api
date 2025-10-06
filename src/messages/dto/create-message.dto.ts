import { IsString, IsNotEmpty, IsOptional, IsEnum, IsObject } from 'class-validator';
import { MessageSender, MessageType } from '@prisma/client';

export class CreateMessageDto {
  @IsString()
  @IsNotEmpty()
  content: string;

  @IsString()
  @IsNotEmpty()
  conversationId: string;

  @IsOptional()
  @IsEnum(MessageSender)
  sender?: MessageSender;

  @IsOptional()
  @IsEnum(MessageType)
  messageType?: MessageType;

  @IsOptional()
  @IsObject()
  metadata?: any;
}
