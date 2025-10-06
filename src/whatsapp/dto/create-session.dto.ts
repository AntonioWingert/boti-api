import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateSessionDto {
  @IsString()
  @IsNotEmpty()
  companyId: string;

  @IsString()
  @IsNotEmpty()
  sessionName: string;

  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @IsString()
  @IsOptional()
  chatbotId?: string;
}
