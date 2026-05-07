/* ============================================================
 * 模块: 数据库连接与建表 (DB Bootstrap)
 * 职责: 提供唯一的 drizzle db 实例,并在启动时确保所有表已建。
 * ============================================================ */

import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite);

/* ---------- 表结构初始化(无需 migrate,保证零依赖启动) ---------- */
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS talents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    id_card TEXT NOT NULL UNIQUE,
    mobile TEXT,
    bank_card TEXT,
    income_type TEXT NOT NULL,
    relation TEXT NOT NULL,
    kyc_status TEXT NOT NULL DEFAULT 'unverified',
    note TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS incomes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    talent_id INTEGER NOT NULL,
    period TEXT NOT NULL,
    amount REAL NOT NULL,
    income_type TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tax_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    income_id INTEGER NOT NULL,
    taxable_income REAL NOT NULL,
    rate REAL NOT NULL,
    quick_deduction REAL NOT NULL,
    tax_amount REAL NOT NULL,
    net_income REAL NOT NULL,
    explanation TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS kyc_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    talent_id INTEGER,
    talent_name TEXT,
    mode TEXT NOT NULL,
    source TEXT,
    period TEXT,
    income_type TEXT,
    relation TEXT,
    amount REAL,
    tax_amount REAL,
    passed INTEGER NOT NULL,
    reason TEXT,
    trace_id TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS filings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period TEXT NOT NULL,
    row_count INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
`);
