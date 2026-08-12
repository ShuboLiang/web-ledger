import "reflect-metadata";
import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import { pathToFileURL } from "node:url";
import { AppModule } from "./app.module.js";
import { ApiExceptionFilter } from "./common/api-exception.filter.js";

export async function createApplication() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(["log", "error", "warn"]);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: false }));
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();
  return app;
}

export async function startServer(options: { port?: number; host?: string } = {}) {
  const app = await createApplication();
  const port = options.port ?? (Number(process.env.PORT) || 3218);
  const host = options.host ?? (process.env.HOST || "127.0.0.1");
  await app.listen(port, host);
  const server = app.getHttpServer();
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  Logger.log(`轻账已启动：http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${actualPort}`, "Bootstrap");
  return { app, server };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer().catch((error) => {
    Logger.error(error instanceof Error ? error.stack : String(error), "Bootstrap");
    process.exit(1);
  });
}
