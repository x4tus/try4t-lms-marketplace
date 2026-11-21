import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { ZodSchema } from 'zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      throw new BadRequestException({
        message: 'Dữ liệu đầu vào không hợp lệ',
        errors: fieldErrors,
      });
    }
    return result.data;
  }
}
