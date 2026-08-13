import { Type } from "class-transformer"
import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from "class-validator"

export class TransactionInputDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/) date!: string
  @Type(() => Number) @IsNumber() amount!: number
  @IsOptional() @IsIn(["expense", "income"]) direction?: "expense" | "income"
  @IsString() @MaxLength(80) item!: string
  @IsString() @MaxLength(40) category1!: string
  @IsString() @MaxLength(40) category2!: string
  @IsOptional() @IsString() @MaxLength(500) note?: string
}

export class TransactionBatchDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransactionInputDto)
  records!: TransactionInputDto[]
}
