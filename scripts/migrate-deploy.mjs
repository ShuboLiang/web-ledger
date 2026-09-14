import { execFileSync } from "node:child_process"
import { PrismaClient } from "@prisma/client"

const SHOPPING_PLANS = "20260908080000_shopping_plans"
const SHOPPING_INCOMES = "20260908090000_shopping_incomes"

function runPrisma(args) {
  execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", ...args],
    { stdio: "inherit", env: process.env },
  )
}

async function tableExists(prisma, name) {
  const rows = await prisma.$queryRaw`
    SELECT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class AS cls
      JOIN pg_catalog.pg_namespace AS ns ON ns.oid = cls.relnamespace
      WHERE ns.nspname = 'public'
        AND cls.relname = ${name}
        AND cls.relkind = 'r'
    ) AS exists
  `
  return Boolean(rows[0]?.exists)
}

async function columnExists(prisma, table, column) {
  const rows = await prisma.$queryRaw`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ${table}
        AND column_name = ${column}
    ) AS exists
  `
  return Boolean(rows[0]?.exists)
}

async function exec(prisma, sql) {
  await prisma.$executeRawUnsafe(sql)
}

async function renameOrAdd(
  prisma,
  table,
  column,
  { aliases = [], sqlType, defaultSql, notNull = true } = {},
) {
  if (await columnExists(prisma, table, column)) return
  for (const alias of aliases) {
    if (!(await columnExists(prisma, table, alias))) continue
    console.log(`将 ${table}.${alias} 重命名为 ${column}`)
    await exec(
      prisma,
      `ALTER TABLE "${table}" RENAME COLUMN "${alias}" TO "${column}"`,
    )
    return
  }
  console.log(`正在为旧的 ${table} 表补上 ${column} 列`)
  const def = defaultSql ? ` DEFAULT ${defaultSql}` : ""
  await exec(
    prisma,
    `ALTER TABLE "${table}" ADD COLUMN "${column}" ${sqlType}${def}`,
  )
  if (notNull && defaultSql) {
    await exec(
      prisma,
      `UPDATE "${table}" SET "${column}" = ${defaultSql} WHERE "${column}" IS NULL`,
    )
    await exec(
      prisma,
      `ALTER TABLE "${table}" ALTER COLUMN "${column}" SET NOT NULL`,
    )
  }
}

async function fillMonth(prisma, table) {
  const createdAt = (await columnExists(prisma, table, "created_at"))
    ? `"created_at"`
    : "now()"
  await exec(
    prisma,
    `UPDATE "${table}"
     SET "month" = (date_trunc('month', timezone('Asia/Shanghai', COALESCE(${createdAt}, now()))))::date
     WHERE "month" IS NULL`,
  )
  await exec(prisma, `ALTER TABLE "${table}" ALTER COLUMN "month" SET NOT NULL`)
}

async function alignShoppingTable(prisma, table, { purchased = false } = {}) {
  if (!(await tableExists(prisma, table))) return

  await renameOrAdd(prisma, table, "ledger_id", {
    aliases: ["ledgerid", "ledgerId"],
    sqlType: "TEXT",
    defaultSql: `''`,
  })
  await renameOrAdd(prisma, table, "month", {
    aliases: ["date", "target_month", "for_month"],
    sqlType: "DATE",
  })
  await fillMonth(prisma, table)
  await renameOrAdd(prisma, table, "name", {
    aliases: ["title", "item", "product", "label"],
    sqlType: "VARCHAR(80)",
    defaultSql: `''`,
  })
  await renameOrAdd(prisma, table, "amount", {
    aliases: ["price", "cost", "value", "money", "unit_price"],
    sqlType: "DECIMAL(14,2)",
    defaultSql: "0.01",
  })
  await renameOrAdd(prisma, table, "note", {
    aliases: ["remark", "comment", "memo"],
    sqlType: "VARCHAR(500)",
    defaultSql: `''`,
  })
  if (purchased) {
    await renameOrAdd(prisma, table, "purchased", {
      aliases: ["checked", "bought", "done", "is_purchased"],
      sqlType: "BOOLEAN",
      defaultSql: "false",
    })
  }
  await renameOrAdd(prisma, table, "created_at", {
    sqlType: "TIMESTAMP(3)",
    defaultSql: "CURRENT_TIMESTAMP",
  })
  await renameOrAdd(prisma, table, "updated_at", {
    sqlType: "TIMESTAMP(3)",
    defaultSql: "CURRENT_TIMESTAMP",
  })

  if (
    (await columnExists(prisma, table, "ledger_id")) &&
    (await columnExists(prisma, table, "month"))
  ) {
    await exec(
      prisma,
      `CREATE INDEX IF NOT EXISTS "${table}_ledger_id_month_idx"
       ON "${table}"("ledger_id", "month")`,
    )
  }

  await syncLegacyPrice(prisma, table)
  await relaxLegacyNotNull(prisma, table, purchased)
}

const prismaShoppingColumns = (purchased) =>
  new Set([
    "id",
    "ledger_id",
    "month",
    "name",
    "amount",
    "note",
    ...(purchased ? ["purchased"] : []),
    "created_at",
    "updated_at",
  ])

async function syncLegacyPrice(prisma, table) {
  if (
    !(await columnExists(prisma, table, "amount")) ||
    !(await columnExists(prisma, table, "unit_price"))
  ) {
    return
  }

  console.log(`同步 ${table} 的遗留 unit_price 列`)
  await exec(
    prisma,
    `UPDATE "${table}"
     SET "amount" = "unit_price"
     WHERE "unit_price" IS NOT NULL
       AND "unit_price" <> 0.01
       AND ("amount" IS NULL OR "amount" = 0.01)`,
  )
  await exec(
    prisma,
    `UPDATE "${table}"
     SET "unit_price" = COALESCE("unit_price", "amount", 0.01)`,
  )
  await exec(
    prisma,
    `ALTER TABLE "${table}" ALTER COLUMN "unit_price" SET DEFAULT 0.01`,
  )

  if (table !== "shopping_items") return

  await exec(
    prisma,
    `CREATE OR REPLACE FUNCTION shopping_items_sync_unit_price()
     RETURNS trigger
     LANGUAGE plpgsql
     AS $fn$
     BEGIN
       IF NEW.unit_price IS NULL THEN
         NEW.unit_price := COALESCE(NEW.amount, 0.01);
       END IF;
       IF NEW.amount IS NULL THEN
         NEW.amount := COALESCE(NEW.unit_price, 0.01);
       END IF;
       RETURN NEW;
     END;
     $fn$`,
  )
  await exec(
    prisma,
    `DROP TRIGGER IF EXISTS shopping_items_sync_unit_price ON "shopping_items"`,
  )
  await exec(
    prisma,
    `CREATE TRIGGER shopping_items_sync_unit_price
     BEFORE INSERT OR UPDATE ON "shopping_items"
     FOR EACH ROW
     EXECUTE PROCEDURE shopping_items_sync_unit_price()`,
  )
}

async function relaxLegacyNotNull(prisma, table, purchased) {
  const known = prismaShoppingColumns(purchased)
  const columns = await prisma.$queryRaw`
    SELECT column_name, is_nullable, column_default, udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ${table}
  `
  for (const column of columns) {
    const name = column.column_name
    if (known.has(name)) continue
    if (column.is_nullable === "YES" || column.column_default != null) continue

    console.log(`为遗留列 ${table}.${name} 放开非空约束，避免 Prisma 写入失败`)
    if (name === "quantity" || name === "qty" || name === "count") {
      await exec(
        prisma,
        `ALTER TABLE "${table}" ALTER COLUMN "${name}" SET DEFAULT 1`,
      )
      await exec(
        prisma,
        `UPDATE "${table}" SET "${name}" = 1 WHERE "${name}" IS NULL`,
      )
      continue
    }
    await exec(
      prisma,
      `ALTER TABLE "${table}" ALTER COLUMN "${name}" DROP NOT NULL`,
    )
  }
}

async function ensureSettingsStub(prisma) {
  const hasItems = await tableExists(prisma, "shopping_items")
  const hasSettings = await tableExists(prisma, "shopping_settings")
  const hasIncomes = await tableExists(prisma, "shopping_incomes")
  if (!hasItems || hasSettings || hasIncomes) return

  console.log("shopping_items 已存在但 shopping_settings 已缺失，补一张空表供后续迁移删除")
  await exec(
    prisma,
    `CREATE TABLE "shopping_settings" (
      "id" TEXT NOT NULL,
      "ledger_id" TEXT NOT NULL,
      "salary" DECIMAL(14,2) NOT NULL,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "shopping_settings_pkey" PRIMARY KEY ("id")
    )`,
  )
}

const prisma = new PrismaClient()
let canResolve = true
try {
  await prisma.$queryRaw`SELECT 1 FROM "_prisma_migrations" LIMIT 1`
} catch {
  canResolve = false
}

try {
  if (canResolve) {
    await alignShoppingTable(prisma, "shopping_items", { purchased: true })
    await alignShoppingTable(prisma, "shopping_incomes")

    const failed = await prisma.$queryRaw`
      SELECT "migration_name"
      FROM "_prisma_migrations"
      WHERE "started_at" IS NOT NULL
        AND "finished_at" IS NULL
        AND "rolled_back_at" IS NULL
    `

    for (const row of failed) {
      const name = row.migration_name
      let applied = false
      if (name === SHOPPING_PLANS) {
        applied =
          (await tableExists(prisma, "shopping_items")) ||
          (await tableExists(prisma, "shopping_settings"))
      } else if (name === SHOPPING_INCOMES) {
        applied = await tableExists(prisma, "shopping_incomes")
      } else {
        continue
      }

      if (applied) {
        console.log(`表已存在，将失败迁移标记为已应用：${name}`)
        runPrisma(["migrate", "resolve", "--applied", name])
      } else {
        console.log(`表不存在，将失败迁移标记为已回滚：${name}`)
        runPrisma(["migrate", "resolve", "--rolled-back", name])
      }
    }

    await ensureSettingsStub(prisma)
  }
} finally {
  await prisma.$disconnect()
}

runPrisma(["migrate", "deploy"])
