// routes/sql.js — Live SQL Console executor for DBA view
const express = require('express');
const router = express.Router();
const { queryAll, queryOne, runQuery } = require('../database');

// ─── POST /api/sql/run — Execute arbitrary SQL ───────────────────────────────
router.post('/run', (req, res) => {
    const { sql: rawSql } = req.body;
    if (!rawSql || !rawSql.trim()) return res.status(400).json({ error: 'No SQL provided' });

    const sql = rawSql.trim();
    const start = Date.now();

    try {
        const upperSql = sql.toUpperCase().replace(/\s+/g, ' ');
        // Added EXPLAIN so absolutely everything parses correctly!
        const isSelect = upperSql.startsWith('SELECT') || upperSql.startsWith('PRAGMA') || upperSql.startsWith('WITH') || upperSql.startsWith('EXPLAIN');

        if (isSelect) {
            const rows = queryAll(sql);
            const elapsed = Date.now() - start;
            return res.json({
                type: 'SELECT',
                rows,
                rowCount: rows.length,
                columns: rows.length > 0 ? Object.keys(rows[0]) : [],
                elapsed,
                sql,
            });
        } else {
            const info = runQuery(sql);
            const elapsed = Date.now() - start;
            return res.json({
                type: 'MUTATION',
                rowsAffected: info?.changes ?? 0,
                lastInsertRowid: info?.lastInsertRowid ?? null,
                elapsed,
                sql,
            });
        }
    } catch (e) {
        return res.status(400).json({ error: e.message, sql });
    }
});

// ─── GET /api/sql/ddl — Return CREATE TABLE / TRIGGER DDL for all objects ────
router.get('/ddl', (req, res) => {
    try {
        const objects = queryAll(`
            SELECT type, name, sql
            FROM sqlite_master
            WHERE sql IS NOT NULL
            ORDER BY
              CASE type WHEN 'table' THEN 0 WHEN 'trigger' THEN 1 ELSE 2 END,
              name
        `);
        res.json(objects);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── GET /api/sql/presets — Categorised preset queries ───────────────────────
router.get('/presets', (req, res) => {
    res.json([
        {
            category: '📋 DDL — Schema',
            queries: [
                {
                    label: 'CREATE TABLE Bank',
                    sql: `CREATE TABLE IF NOT EXISTS Bank (\n  Bank_Id  INTEGER PRIMARY KEY AUTOINCREMENT,\n  name     TEXT    NOT NULL,\n  location TEXT    NOT NULL\n);`,
                },
                {
                    label: 'CREATE TABLE Customers',
                    sql: `CREATE TABLE IF NOT EXISTS Customers (\n  AccHolder_Id  INTEGER PRIMARY KEY AUTOINCREMENT,\n  FirstName     TEXT    NOT NULL,\n  MiddleName    TEXT,\n  LastName      TEXT    NOT NULL,\n  Age           INTEGER NOT NULL,\n  Sex           TEXT    NOT NULL\n);`,
                },
                {
                    label: 'CREATE TABLE BankAccount',
                    sql: `CREATE TABLE IF NOT EXISTS BankAccount (\n  Account_no   TEXT    PRIMARY KEY,\n  Account_Type TEXT    NOT NULL,\n  Balance      REAL    NOT NULL DEFAULT 0,\n  Status       TEXT    NOT NULL DEFAULT 'Active',\n  Date_Opened  TEXT    NOT NULL,\n  IFSC_code    TEXT    NOT NULL,\n  Branch_code  TEXT    NOT NULL,\n  Bank_Id      INTEGER NOT NULL REFERENCES Bank(Bank_Id) ON DELETE CASCADE,\n  AccHolder_Id INTEGER NOT NULL REFERENCES Customers(AccHolder_Id) ON DELETE CASCADE\n);`,
                },
                {
                    label: 'CREATE TABLE LinkedCards',
                    sql: `CREATE TABLE IF NOT EXISTS LinkedCards (\n  Card_no    TEXT PRIMARY KEY,\n  Account_no TEXT NOT NULL REFERENCES BankAccount(Account_no) ON DELETE CASCADE\n);`,
                },
                {
                    label: 'CREATE TABLE Txn',
                    sql: `CREATE TABLE IF NOT EXISTS Txn (\n  Transaction_id   INTEGER PRIMARY KEY AUTOINCREMENT,\n  Transaction_type TEXT    NOT NULL,\n  Currency         TEXT    NOT NULL DEFAULT 'INR',\n  Amount           REAL    NOT NULL,\n  Transaction_date TEXT    NOT NULL,\n  Account_no       TEXT    NOT NULL REFERENCES BankAccount(Account_no) ON DELETE CASCADE,\n  AccHolder_Id     INTEGER NOT NULL REFERENCES Customers(AccHolder_Id) ON DELETE CASCADE\n);`,
                },
                {
                    label: 'CREATE TABLE TransactionLog',
                    sql: `CREATE TABLE IF NOT EXISTS TransactionLog (\n  log_id         INTEGER PRIMARY KEY AUTOINCREMENT,\n  action         TEXT    NOT NULL,\n  Transaction_id INTEGER,\n  Account_no     TEXT,\n  new_amount     REAL,\n  old_amount     REAL,\n  txn_type       TEXT,\n  logged_at      TEXT    DEFAULT (datetime('now','localtime'))\n);`,
                },
                {
                    label: 'CREATE TABLE AccountAuditLog',
                    sql: `CREATE TABLE IF NOT EXISTS AccountAuditLog (\n  log_id       INTEGER PRIMARY KEY AUTOINCREMENT,\n  action       TEXT    NOT NULL,\n  Account_no   TEXT,\n  old_balance  REAL,\n  new_balance  REAL,\n  old_status   TEXT,\n  new_status   TEXT,\n  Bank_Id      INTEGER,\n  AccHolder_Id INTEGER,\n  logged_at    TEXT    DEFAULT (datetime('now','localtime'))\n);`,
                },
            ],
        },
        {
            category: '🔍 SELECT — Basic',
            queries: [
                { label: 'All Banks', sql: 'SELECT * FROM Bank ORDER BY Bank_Id;' },
                { label: 'All Customers', sql: 'SELECT * FROM Customers ORDER BY AccHolder_Id;' },
                { label: 'All BankAccounts', sql: 'SELECT * FROM BankAccount ORDER BY Date_Opened DESC;' },
                { label: 'All Transactions', sql: 'SELECT * FROM Txn ORDER BY Transaction_id DESC;' },
                { label: 'All LinkedCards', sql: 'SELECT * FROM LinkedCards;' },
                { label: 'TransactionLog', sql: 'SELECT * FROM TransactionLog ORDER BY log_id DESC LIMIT 50;' },
                { label: 'AccountAuditLog', sql: 'SELECT * FROM AccountAuditLog ORDER BY log_id DESC LIMIT 50;' },
            ],
        },
        {
            category: '⋈ JOIN Queries',
            queries: [
                {
                    label: 'Account Holder Profile (3-table JOIN)',
                    sql: `SELECT\n  c.AccHolder_Id,\n  c.FirstName || ' ' || c.LastName AS full_name,\n  c.Age, c.Sex,\n  ba.Account_no, ba.Account_Type,\n  ba.Balance, ba.Status,\n  ba.Date_Opened, ba.IFSC_code,\n  b.name AS bank_name, b.location\nFROM Customers c\nJOIN BankAccount ba ON c.AccHolder_Id = ba.AccHolder_Id\nJOIN Bank b          ON ba.Bank_Id     = b.Bank_Id\nORDER BY c.AccHolder_Id;`,
                },
                {
                    label: 'Full Transaction Ledger (4-table JOIN)',
                    sql: `SELECT\n  t.Transaction_id,\n  t.Transaction_type,\n  t.Currency,\n  t.Amount,\n  t.Transaction_date,\n  t.Account_no,\n  c.FirstName || ' ' || c.LastName AS customer_name,\n  c.Age, c.Sex,\n  ba.Account_Type,\n  ba.Balance AS current_balance,\n  ba.Status AS account_status,\n  b.name AS bank_name,\n  b.location AS bank_location\nFROM Txn t\nJOIN BankAccount ba ON t.Account_no   = ba.Account_no\nJOIN Customers   c  ON t.AccHolder_Id = c.AccHolder_Id\nJOIN Bank        b  ON ba.Bank_Id     = b.Bank_Id\nORDER BY t.Transaction_id DESC;`,
                },
                {
                    label: 'Customer Summary (LEFT JOIN + GROUP BY)',
                    sql: `SELECT\n  c.AccHolder_Id,\n  c.FirstName || ' ' || c.LastName AS full_name,\n  c.Age, c.Sex,\n  COUNT(DISTINCT ba.Account_no)    AS total_accounts,\n  COALESCE(SUM(ba.Balance), 0)     AS total_balance,\n  COUNT(DISTINCT t.Transaction_id) AS total_transactions,\n  COALESCE(SUM(CASE WHEN t.Transaction_type='Credit'  THEN t.Amount ELSE 0 END),0) AS total_credits,\n  COALESCE(SUM(CASE WHEN t.Transaction_type='Debit'   THEN t.Amount ELSE 0 END),0) AS total_debits\nFROM Customers c\nLEFT JOIN BankAccount ba ON c.AccHolder_Id = ba.AccHolder_Id\nLEFT JOIN Txn         t  ON c.AccHolder_Id = t.AccHolder_Id\nGROUP BY c.AccHolder_Id\nORDER BY total_balance DESC;`,
                },
                {
                    label: 'Accounts with Linked Cards (LEFT JOIN)',
                    sql: `SELECT\n  ba.Account_no, ba.Account_Type,\n  ba.Balance, ba.Status, ba.IFSC_code,\n  c.FirstName || ' ' || c.LastName AS holder_name,\n  b.name AS bank_name,\n  lc.Card_no\nFROM BankAccount ba\nJOIN Customers   c  ON ba.AccHolder_Id = c.AccHolder_Id\nJOIN Bank        b  ON ba.Bank_Id      = b.Bank_Id\nLEFT JOIN LinkedCards lc ON ba.Account_no = lc.Account_no\nORDER BY ba.Account_no;`,
                },
            ],
        },
        {
            category: '⚡ Triggers',
            queries: [
                {
                    label: 'List All Triggers',
                    sql: `SELECT name, tbl_name, sql\nFROM sqlite_master\nWHERE type = 'trigger'\nORDER BY name;`,
                },
                {
                    label: 'View TransactionLog',
                    sql: `SELECT tl.*,\n  c.FirstName || ' ' || c.LastName AS customer_name\nFROM TransactionLog tl\nLEFT JOIN Txn t ON tl.Transaction_id = t.Transaction_id\nLEFT JOIN Customers c ON t.AccHolder_Id = c.AccHolder_Id\nORDER BY tl.log_id DESC\nLIMIT 25;`,
                },
                {
                    label: 'View AccountAuditLog',
                    sql: `SELECT al.*,\n  c.FirstName || ' ' || c.LastName AS holder_name,\n  b.name AS bank_name\nFROM AccountAuditLog al\nLEFT JOIN BankAccount ba ON al.Account_no  = ba.Account_no\nLEFT JOIN Customers   c  ON al.AccHolder_Id = c.AccHolder_Id\nLEFT JOIN Bank        b  ON al.Bank_Id      = b.Bank_Id\nORDER BY al.log_id DESC\nLIMIT 25;`,
                },
            ],
        },
        {
            category: '📊 Aggregates & Analytics',
            queries: [
                {
                    label: 'Balance by Bank',
                    sql: `SELECT\n  b.name AS bank_name,\n  COUNT(ba.Account_no)     AS total_accounts,\n  SUM(ba.Balance)          AS total_balance,\n  AVG(ba.Balance)          AS avg_balance,\n  MAX(ba.Balance)          AS max_balance\nFROM Bank b\nLEFT JOIN BankAccount ba ON b.Bank_Id = ba.Bank_Id\nGROUP BY b.Bank_Id\nORDER BY total_balance DESC;`,
                },
                {
                    label: 'Transaction Volume by Type',
                    sql: `SELECT\n  Transaction_type,\n  COUNT(*)      AS txn_count,\n  SUM(Amount)   AS total_amount,\n  AVG(Amount)   AS avg_amount,\n  MAX(Amount)   AS max_amount\nFROM Txn\nGROUP BY Transaction_type\nORDER BY total_amount DESC;`,
                },
                {
                    label: 'Monthly Transaction Trend',
                    sql: `SELECT\n  strftime('%Y-%m', Transaction_date) AS month,\n  COUNT(*)                           AS txn_count,\n  SUM(Amount)                        AS total_amount\nFROM Txn\nGROUP BY month\nORDER BY month;`,
                },
                {
                    label: 'Top Customers by Balance',
                    sql: `SELECT\n  c.FirstName || ' ' || c.LastName AS name,\n  c.Age, c.Sex,\n  SUM(ba.Balance) AS total_balance,\n  COUNT(ba.Account_no) AS account_count\nFROM Customers c\nJOIN BankAccount ba ON c.AccHolder_Id = ba.AccHolder_Id\nGROUP BY c.AccHolder_Id\nORDER BY total_balance DESC;`,
                },
            ],
        },
        {
            category: '🔧 PRAGMA / Meta',
            queries: [
                { label: 'List All Tables', sql: `SELECT name, type FROM sqlite_master WHERE type='table' ORDER BY name;` },
                { label: 'Foreign Key List', sql: `SELECT * FROM sqlite_master WHERE type='table' AND sql LIKE '%REFERENCES%';` },
                { label: 'PRAGMA table_info(BankAccount)', sql: `PRAGMA table_info(BankAccount);` },
                { label: 'PRAGMA table_info(Txn)', sql: `PRAGMA table_info(Txn);` },
                { label: 'PRAGMA foreign_key_list(BankAccount)', sql: `PRAGMA foreign_key_list(BankAccount);` },
                { label: 'PRAGMA foreign_key_list(Txn)', sql: `PRAGMA foreign_key_list(Txn);` },
            ],
        },
    ]);
});

module.exports = router;