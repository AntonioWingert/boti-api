import { IsString, IsNotEmpty, IsEnum, IsDateString, IsArray, ValidateNested, IsOptional, IsNumber, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { DisparoTipo } from '@prisma/client';

export class CreateRecipientDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  phone: string;
}

export class CreateAttachmentDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsNumber()
  size: number;

  @IsString()
  @IsNotEmpty()
  url: string;

  @IsBoolean()
  isImage: boolean;
}

export class CreateDisparoDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsEnum(DisparoTipo)
  type: DisparoTipo;

  @IsDateString()
  scheduledFor: string;

  @IsOptional()
  @IsNumber()
  sendInterval?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateRecipientDto)
  @IsOptional()
  recipients?: CreateRecipientDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAttachmentDto)
  @IsOptional()
  attachments?: CreateAttachmentDto[];
}
