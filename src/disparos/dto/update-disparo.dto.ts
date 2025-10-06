import { PartialType } from '@nestjs/mapped-types';
import { CreateDisparoDto } from './create-disparo.dto';

export class UpdateDisparoDto extends PartialType(CreateDisparoDto) {}
