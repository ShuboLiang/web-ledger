import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");

function cleanText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function assertDate(value) {
  const date = cleanText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new Error("日期必须使用 YYYY-MM-DD 格式");
  }
  return date;
}

export function normalizeRecord(record) {
  const rawAmount = Number(record.amount);
  if (!Number.isFinite(rawAmount) || rawAmount === 0) throw new Error("金额必须是非零数字");
  const direction = record.direction === "income" ? "income" : "expense";
  return {
    date: assertDate(record.date),
    amount: direction === "income" ? Math.abs(rawAmount) : -Math.abs(rawAmount),
    item: cleanText(record.item, "未命名项目"),
    category1: cleanText(record.category1, "其他"),
    category2: cleanText(record.category2, "待分类"),
    note: cleanText(record.note),
  };
}

export function createLedgerDatabase(customPath) {
  const dbPath = path.resolve(customPath || process.env.DB_PATH || path.join(appRoot, "data", "ledger.sqlite"));
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      amount REAL NOT NULL CHECK(amount <> 0),
      item TEXT NOT NULL,
      category1 TEXT NOT NULL,
      category2 TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date DESC);
    CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category1, category2);
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category1 TEXT NOT NULL,
      category2 TEXT NOT NULL,
      UNIQUE(category1, category2)
    );
  `);

  const insertProject = db.prepare("INSERT OR IGNORE INTO projects(name) VALUES (?)");
  const insertCategory = db.prepare("INSERT OR IGNORE INTO categories(category1, category2) VALUES (?, ?)");
  const insertTransaction = db.prepare(`
    INSERT INTO transactions(date, amount, item, category1, category2, note)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  function addMany(records) {
    const normalized = records.map(normalizeRecord);
    db.exec("BEGIN IMMEDIATE");
    try {
      const created = normalized.map((record) => {
        insertProject.run(record.item);
        insertCategory.run(record.category1, record.category2);
        const result = insertTransaction.run(
          record.date,
          record.amount,
          record.item,
          record.category1,
          record.category2,
          record.note,
        );
        return { id: Number(result.lastInsertRowid), ...record };
      });
      db.exec("COMMIT");
      return created;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  const count = Number(db.prepare("SELECT COUNT(*) AS count FROM transactions").get().count);
  if (count === 0 && process.env.NO_SEED !== "1") {
    const seedPath = path.resolve(process.env.INITIAL_LEDGER_PATH || path.join(appRoot, "data", "initial-ledger.json"));
    addMany(JSON.parse(readFileSync(seedPath, "utf8")));
  }

  return {
    path: dbPath,
    allTransactions() {
      return db.prepare("SELECT * FROM transactions ORDER BY date DESC, id DESC").all();
    },
    listTransactions(limit = 100) {
      const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
      return db.prepare("SELECT * FROM transactions ORDER BY date DESC, id DESC LIMIT ?").all(safeLimit);
    },
    pageTransactions({ page = 1, pageSize = 20, month = "", query = "", category1 = "", category2 = "", direction = "", sortBy = "date", sortOrder = "desc" } = {}) {
      const safePageSize = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
      const selectedMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(month)) ? String(month) : "";
      const search = cleanText(query).slice(0, 80);
      const selectedCategory = cleanText(category1).slice(0, 40);
      const selectedSecondary = cleanText(category2).slice(0, 40);
      const selectedDirection = ["expense", "income"].includes(direction) ? direction : "";
      const clauses = [];
      const params = [];
      if (selectedMonth) {
        clauses.push("date >= ? AND date <= ?");
        params.push(`${selectedMonth}-01`, `${selectedMonth}-31`);
      }
      if (search) {
        clauses.push("(item LIKE ? OR note LIKE ? OR category1 LIKE ? OR category2 LIKE ?)");
        const pattern = `%${search}%`;
        params.push(pattern, pattern, pattern, pattern);
      }
      if (selectedCategory) {
        clauses.push("category1 = ?");
        params.push(selectedCategory);
      }
      if (selectedSecondary) {
        clauses.push("category2 = ?");
        params.push(selectedSecondary);
      }
      if (selectedDirection) clauses.push(selectedDirection === "expense" ? "amount < 0" : "amount > 0");
      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
      const sortColumns = { date: "date", amount: "amount", item: "item" };
      const orderBy = sortColumns[sortBy] || "date";
      const order = String(sortOrder).toLowerCase() === "asc" ? "ASC" : "DESC";
      const total = Number(db.prepare(`SELECT COUNT(*) AS count FROM transactions ${where}`).get(...params).count);
      const totalPages = Math.max(1, Math.ceil(total / safePageSize));
      const safePage = Math.min(Math.max(Number(page) || 1, 1), totalPages);
      const records = db.prepare(`
        SELECT * FROM transactions ${where}
        ORDER BY ${orderBy} ${order}, id ${order} LIMIT ? OFFSET ?
      `).all(...params, safePageSize, (safePage - 1) * safePageSize);
      return { records, total, page: safePage, pageSize: safePageSize, totalPages, month: selectedMonth, query: search, category1: selectedCategory, category2: selectedSecondary, direction: selectedDirection, sortBy: orderBy, sortOrder: order.toLowerCase() };
    },
    get(id) {
      return db.prepare("SELECT * FROM transactions WHERE id = ?").get(Number(id)) || null;
    },
    dictionaries() {
      return {
        projects: db.prepare("SELECT name FROM projects ORDER BY id").all().map((row) => row.name),
        categories: db.prepare("SELECT category1, category2 FROM categories ORDER BY id").all(),
      };
    },
    addMany,
    update(id, changes) {
      const existing = db.prepare("SELECT * FROM transactions WHERE id = ?").get(Number(id));
      if (!existing) throw new Error(`未找到编号为 ${id} 的账目`);
      const merged = normalizeRecord({
        ...existing,
        ...changes,
        amount: changes.amount ?? Math.abs(existing.amount),
        direction: changes.direction ?? (existing.amount > 0 ? "income" : "expense"),
      });
      db.exec("BEGIN IMMEDIATE");
      try {
        insertProject.run(merged.item);
        insertCategory.run(merged.category1, merged.category2);
        db.prepare(`
          UPDATE transactions SET date = ?, amount = ?, item = ?, category1 = ?, category2 = ?, note = ?
          WHERE id = ?
        `).run(merged.date, merged.amount, merged.item, merged.category1, merged.category2, merged.note, Number(id));
        db.exec("COMMIT");
        return { id: Number(id), ...merged };
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    delete(id) {
      return Number(db.prepare("DELETE FROM transactions WHERE id = ?").run(Number(id)).changes);
    },
    close() {
      db.close();
    },
  };
}
