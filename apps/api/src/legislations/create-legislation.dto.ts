import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';

export class CreateLegislationDto {
  @ApiProperty({ example: 'قانون نموذجي جديد' })
  @IsString({ message: 'العنوان العربي مطلوب.' }) @Length(3, 1000, { message: 'طول العنوان غير صالح.' })
  titleAr!: string;

  @ApiProperty() @IsUUID('4', { message: 'معرّف النوع غير صالح.' })
  typeId!: string;

  @ApiProperty() @IsUUID('4', { message: 'معرّف الجهة غير صالح.' })
  authorityId!: string;

  @ApiProperty({ example: 2026 }) @IsInt() @Min(1900) @Max(2200)
  year!: number;

  @ApiProperty({ required: false }) @IsOptional() @IsString() @Length(1, 80)
  officialNumber?: string;
}

