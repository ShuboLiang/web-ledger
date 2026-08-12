import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthController } from "./auth.controller.js";
import { AuthGuard } from "./auth.guard.js";
import { AuthService } from "./auth.service.js";
import { CurrentUserService } from "./current-user.service.js";

@Global()
@Module({ controllers: [AuthController], providers: [AuthService, CurrentUserService, { provide: APP_GUARD, useClass: AuthGuard }], exports: [CurrentUserService] })
export class AuthModule {}
