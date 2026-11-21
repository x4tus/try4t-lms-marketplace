import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Hệ thống đang bận một chút, bạn thử lại sau vài giây nhé.';
    let code: string | undefined;
    let errors: Record<string, string[]> | undefined;
    let meta: Record<string, unknown> | undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (statusCode === HttpStatus.TOO_MANY_REQUESTS && typeof exceptionResponse === 'string') {
        code = 'RATE_LIMITED';
        message = 'Bạn thao tác hơi nhanh rồi! Chờ một chút rồi thử lại nhé.';
      } else if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as {
          code?: string;
          message?: string | string[];
          errors?: Record<string, string[]>;
          meta?: Record<string, unknown>;
        };
        code = resp.code;
        meta = resp.meta;
        errors = resp.errors;
        if (Array.isArray(resp.message)) {
          message = resp.message[0] ?? message;
        } else if (typeof resp.message === 'string') {
          if (statusCode === HttpStatus.TOO_MANY_REQUESTS && resp.message.includes('Throttler')) {
            code = code ?? 'RATE_LIMITED';
            message = 'Bạn gửi quá nhiều yêu cầu liên tiếp. Vui lòng chờ 1 phút rồi thử lại.';
          } else {
            message = resp.message;
          }
        }
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        statusCode = HttpStatus.CONFLICT;
        code = 'DUPLICATE_ENTRY';
        message = 'Dữ liệu này đã tồn tại trong hệ thống.';
      } else if (exception.code === 'P2025') {
        statusCode = HttpStatus.NOT_FOUND;
        code = 'NOT_FOUND';
        message = 'Không tìm thấy dữ liệu bạn yêu cầu.';
      } else if (exception.code === 'P2003') {
        statusCode = HttpStatus.BAD_REQUEST;
        code = 'INVALID_REFERENCE';
        message = 'Dữ liệu liên kết không tồn tại hoặc không hợp lệ.';
      } else {
        this.logger.error(`Prisma Error ${exception.code}: ${exception.message}`);
      }
    } else if (exception instanceof Error) {
      this.logger.error(`${request.method} ${request.url} - ${exception.message}`, exception.stack);
    }

    response.status(statusCode).json({
      success: false,
      statusCode,
      ...(code ? { code } : {}),
      message,
      ...(errors ? { errors } : {}),
      ...(meta ? { meta } : {}),
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
