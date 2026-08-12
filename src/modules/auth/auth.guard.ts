import { CanActivate, ExecutionContext, Inject, Injectable, Optional, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { createHash } from "node:crypto";
import type { Request } from "express";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import { PUBLIC_ROUTE } from "./public.decorator.js";

@Injectable()
export class AuthGuard implements CanActivate {
  private reflector: Reflector;
  constructor(private readonly prisma: PrismaService, @Optional() @Inject(Reflector) reflector?: Reflector) {
    this.reflector = reflector ?? new Reflector();
  }
  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;
    const request = context.switchToHttp().getRequest<Request>();
    const url = request.originalUrl.split("?", 1)[0].replace(/\/$/, "");
    if (!url.startsWith("/api/")) return true;
    const cookies = Object.fromEntries(String(request.headers.cookie || "").split(";").map((part) => part.trim().split(/=(.*)/s).slice(0, 2)).filter(([key]) => key));
    const token = cookies.qing_zhang_session;
    if (!token) throw new UnauthorizedException("请先登录");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const session = await this.prisma.authSession.findUnique({ where: { tokenHash }, include: { user: { include: { ledger: { select: { id: true } } } } } });
    if (!session || session.revokedAt || session.tokenVersion !== session.user.tokenVersion || !session.user.ledger) throw new UnauthorizedException("登录状态已失效，请重新登录");
    request.user = { id: session.user.id, username: session.user.username, displayName: session.user.displayName, ledgerId: session.user.ledger.id, sessionId: session.id };
    if (Date.now() - session.lastUsedAt.getTime() > 3_600_000) void this.prisma.authSession.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    return true;
  }
}
