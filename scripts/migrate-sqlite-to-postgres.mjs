import { PrismaClient, Prisma } from "@prisma/client"
import { DatabaseSync } from "node:sqlite"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

if (existsSync(".env")) process.loadEnvFile(".env")
const sourcePath = path.resolve(process.argv[2] || "data/ledger.sqlite")
if (!existsSync(sourcePath))
  throw new Error(`找不到 SQLite 数据库：${sourcePath}`)

const source = new DatabaseSync(sourcePath, { readOnly: true })
const prisma = new PrismaClient()
try {
  let ledger = await prisma.ledger.findFirst({ where: { isDefault: true } })
  ledger ||= await prisma.ledger.create({
    data: { name: "主账本", isDefault: true },
  })
  let account = await prisma.account.findFirst({
    where: { ledgerId: ledger.id },
  })
  account ||= await prisma.account.create({
    data: { ledgerId: ledger.id, name: "默认账户", type: "cash" },
  })
  const existing = await prisma.transaction.count({
    where: { ledgerId: ledger.id },
  })
  if (existing) {
    console.log(`PostgreSQL 已有 ${existing} 笔账目，未重复导入。`)
    process.exitCode = 0
  } else {
    const rows = source.prepare("SELECT * FROM transactions ORDER BY id").all()
    const projects = [
      ...new Set(rows.map((row) => String(row.item).trim())),
    ].map((name, sortOrder) => ({ ledgerId: ledger.id, name, sortOrder }))
    const categoryMap = new Map()
    for (const row of rows)
      categoryMap.set(`${row.category1}\u0000${row.category2}`, {
        ledgerId: ledger.id,
        category1: row.category1,
        category2: row.category2,
        sortOrder: categoryMap.size,
      })
    if (projects.length)
      await prisma.project.createMany({ data: projects, skipDuplicates: true })
    if (categoryMap.size)
      await prisma.category.createMany({
        data: [...categoryMap.values()],
        skipDuplicates: true,
      })
    const categories = await prisma.category.findMany({
      where: { ledgerId: ledger.id },
    })
    const categoryIds = new Map(
      categories.map((row) => [
        `${row.category1}\u0000${row.category2}`,
        row.id,
      ]),
    )
    if (rows.length)
      await prisma.transaction.createMany({
        data: rows.map((row) => ({
          id: Number(row.id),
          ledgerId: ledger.id,
          categoryId: categoryIds.get(`${row.category1}\u0000${row.category2}`),
          accountId: account.id,
          date: new Date(`${row.date}T00:00:00.000Z`),
          amount: new Prisma.Decimal(row.amount),
          item: row.item,
          category1: row.category1,
          category2: row.category2,
          note: row.note || "",
          createdAt: row.created_at
            ? new Date(`${String(row.created_at).replace(" ", "T")}+08:00`)
            : new Date(),
        })),
      })
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('transactions','id'), COALESCE((SELECT MAX(id) FROM transactions), 1), true)`,
    )
    await prisma.auditLog.create({
      data: {
        action: "import",
        entityType: "sqlite",
        payload: { source: path.basename(sourcePath), records: rows.length },
      },
    })
    console.log(`迁移完成：SQLite ${rows.length} 笔账目 → PostgreSQL。`)
  }
} finally {
  source.close()
  await prisma.$disconnect()
}
