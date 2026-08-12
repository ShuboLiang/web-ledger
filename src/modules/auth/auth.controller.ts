import { Body, Controller, Get, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service.js";
import { Public } from "./public.decorator.js";

@Controller("api/auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  private setSession(response: Response, token: string) { response.cookie(this.auth.cookieName(), token, this.auth.cookieOptions()); }

  @Public()
  @Get("status") status() { return { enabled: true }; }
  @Public()
  @Post("register") async register(@Body() body: Record<string, unknown>, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.registerAndLogin(body); this.setSession(response, result.token); return { user: result.user };
  }
  @Public()
  @Post("login") async login(@Body() body: Record<string, unknown>, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.login(body); this.setSession(response, result.token); return { user: result.user };
  }
  @Get("me") me(@Req() request: Request) { return { user: request.user }; }
  @Post("logout") async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(request.user!.sessionId); response.clearCookie(this.auth.cookieName(), { path: "/" }); return { ok: true };
  }
}
