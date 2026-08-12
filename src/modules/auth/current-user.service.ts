import { Inject, Injectable, Scope, UnauthorizedException } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import type { Request } from "express";

@Injectable({ scope: Scope.REQUEST })
export class CurrentUserService {
  constructor(@Inject(REQUEST) private readonly request: Request) {}
  get value() { if (!this.request.user) throw new UnauthorizedException("请先登录"); return this.request.user; }
  get userId() { return this.value.id; }
  get ledgerId() { return this.value.ledgerId; }
}

