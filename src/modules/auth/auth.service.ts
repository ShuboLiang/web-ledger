import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common"
import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto"
import { promisify } from "node:util"
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js"

const scrypt = promisify(scryptCallback)
const COOKIE_NAME = "qing_zhang_session"
const TEN_YEARS_MS = 10 * 365 * 24 * 60 * 60 * 1000
const DEFAULT_CATEGORIES = [
  ["餐饮", "早餐"],
  ["餐饮", "午餐"],
  ["餐饮", "晚餐"],
  ["餐饮", "饮品"],
  ["交通", "公共交通"],
  ["居住", "日常缴费"],
  ["购物", "日用品"],
  ["医疗健康", "药品"],
  ["娱乐", "休闲娱乐"],
  ["收入", "工资"],
]

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  private username(value: unknown) {
    const username = String(value || "")
      .trim()
      .toLowerCase()
    if (!/^[\p{L}\p{N}_.-]{3,40}$/u.test(username))
      throw new BadRequestException(
        "用户名需为 3–40 位，可使用文字、数字、点、横线或下划线",
      )
    return username
  }
  private password(value: unknown) {
    const password = String(value || "")
    if (password.length < 8 || password.length > 128)
      throw new BadRequestException("密码长度需为 8–128 位")
    return password
  }
  private async hashPassword(password: string) {
    const salt = randomBytes(16)
    const derived = (await scrypt(password, salt, 64)) as Buffer
    return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`
  }
  private async verifyPassword(password: string, encoded: string) {
    const [algorithm, saltHex, hashHex] = encoded.split("$")
    if (algorithm !== "scrypt" || !saltHex || !hashHex) return false
    const expected = Buffer.from(hashHex, "hex")
    const actual = (await scrypt(
      password,
      Buffer.from(saltHex, "hex"),
      expected.length,
    )) as Buffer
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    )
  }
  private tokenHash(token: string) {
    return createHash("sha256").update(token).digest("hex")
  }
  private publicUser(user: {
    id: string
    username: string
    displayName: string
  }) {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
    }
  }

  async register(input: Record<string, unknown>) {
    const username = this.username(input.username)
    const passwordHash = await this.hashPassword(this.password(input.password))
    const displayName =
      String(input.displayName || username)
        .trim()
        .slice(0, 60) || username
    try {
      return await this.prisma.$transaction(async (database) => {
        const firstUser = (await database.user.count()) === 0
        const user = await database.user.create({
          data: { username, displayName, passwordHash },
        })
        let ledger = firstUser
          ? await database.ledger.findFirst({
              where: { userId: null },
              orderBy: { createdAt: "asc" },
            })
          : null
        if (ledger) {
          ledger = await database.ledger.update({
            where: { id: ledger.id },
            data: { userId: user.id, isDefault: true },
          })
          await database.aiModelProfile.updateMany({
            where: { userId: null },
            data: { userId: user.id },
          })
          await database.aiConversation.updateMany({
            where: { userId: null },
            data: { userId: user.id },
          })
        } else {
          ledger = await database.ledger.create({
            data: { userId: user.id, name: "个人账本", isDefault: true },
          })
          await database.account.create({
            data: { ledgerId: ledger.id, name: "默认账户", type: "cash" },
          })
          await database.category.createMany({
            data: DEFAULT_CATEGORIES.map(([category1, category2]) => ({
              ledgerId: ledger!.id,
              category1,
              category2,
            })),
          })
        }
        return { user: this.publicUser(user), ledgerId: ledger.id }
      })
    } catch (error: any) {
      if (error?.code === "P2002") throw new ConflictException("用户名已被使用")
      throw error
    }
  }

  async login(input: Record<string, unknown>) {
    const username = this.username(input.username)
    const password = String(input.password || "")
    const user = await this.prisma.user.findUnique({
      where: { username },
      include: { ledger: { select: { id: true } } },
    })
    if (
      !user ||
      !(await this.verifyPassword(password, user.passwordHash)) ||
      !user.ledger
    )
      throw new UnauthorizedException("用户名或密码不正确")
    const token = randomBytes(32).toString("base64url")
    await this.prisma.authSession.create({
      data: {
        userId: user.id,
        tokenHash: this.tokenHash(token),
        tokenVersion: user.tokenVersion,
      },
    })
    return { token, user: this.publicUser(user) }
  }

  async registerAndLogin(input: Record<string, unknown>) {
    await this.register(input)
    return this.login(input)
  }
  async logout(sessionId: string) {
    await this.prisma.authSession.updateMany({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    })
  }
  cookieName() {
    return COOKIE_NAME
  }
  cookieOptions() {
    return {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.COOKIE_SECURE === "1",
      maxAge: TEN_YEARS_MS,
      path: "/",
    }
  }
}
