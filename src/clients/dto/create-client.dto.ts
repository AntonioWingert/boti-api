import { IsString, IsEmail, IsOptional, IsBoolean, IsNotEmpty, MinLength } from 'class-validator';

export class CreateClientDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsBoolean()
  @IsOptional()
  active?: boolean;

  @IsString()
  @IsNotEmpty()
  companyId: string;
}
