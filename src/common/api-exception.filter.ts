import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common"
import type { Response } from "express"

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>()
    const isHttp = exception instanceof HttpException
    const status = isHttp ? exception.getStatus() : HttpStatus.BAD_REQUEST
    const payload = isHttp ? exception.getResponse() : null
    const message =
      typeof payload === "string"
        ? payload
        : Array.isArray((payload as { message?: unknown })?.message)
          ? (payload as { message: string[] }).message.join("；")
          : String(
              (payload as { message?: unknown })?.message ||
                (exception as Error)?.message ||
                "请求失败",
            )

    if (!isHttp)
      this.logger.error(
        message,
        exception instanceof Error ? exception.stack : undefined,
      )
    response.status(status).json({ error: message })
  }
}
