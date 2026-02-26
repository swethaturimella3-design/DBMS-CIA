// routes/schema.js — Database Explorer endpoints
const express = require('express');
const router = express.Router();
const { queryAll, queryOne } = require('../database');

// ─── 1. Raw Tables ─────────────────────────────────────────────────────────
router.get('/tables', (req, res) => {
  try {
    const data = {
      Bank: queryAll('SELECT * FROM Bank ORDER BY Bank_Id'),
      Customers: queryAll('SELECT * FROM Customers ORDER BY AccHolder_Id'),
      BankAccount: queryAll('SELECT * FROM BankAccount ORDER BY Date_Opened DESC'),
      LinkedCards: queryAll('SELECT * FROM LinkedCards'),
      Txn: queryAll('SELECT * FROM Txn ORDER BY Transaction_id DESC'),
      TransactionLog: queryAll('SELECT * FROM TransactionLog ORDER BY log_id DESC LIMIT 50'),
      AccountAuditLog: queryAll('SELECT * FROM AccountAuditLog ORDER BY log_id DESC LIMIT 50'),
    };
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── 2. PK / FK Metadata ──────────────────────────────────────────────────
router.get('/pk-fk', (req, res) => {
  try {
    const schema = {
      Bank: {
        primaryKey: ['Bank_Id'],
        foreignKeys: [],
        columns: [
          { name: 'Bank_Id', type: 'INTEGER', key: 'PK', constraint: 'PRIMARY KEY AUTOINCREMENT' },
          { name: 'name', type: 'TEXT', key: null, constraint: 'NOT NULL' },
          { name: 'location', type: 'TEXT', key: null, constraint: 'NOT NULL' },
        ],
      },
      Customers: {
        primaryKey: ['AccHolder_Id'],
        foreignKeys: [],
        columns: [
          { name: 'AccHolder_Id', type: 'INTEGER', key: 'PK', constraint: 'PRIMARY KEY AUTOINCREMENT' },
          { name: 'FirstName', type: 'TEXT', key: null, constraint: 'NOT NULL' },
          { name: 'MiddleName', type: 'TEXT', key: null, constraint: 'nullable' },
          { name: 'LastName', type: 'TEXT', key: null, constraint: 'NOT NULL' },
          { name: 'Age', type: 'INTEGER', key: null, constraint: 'NOT NULL' },
          { name: 'Sex', type: 'TEXT', key: null, constraint: 'NOT NULL' },
        ],
      },
      BankAccount: {
        primaryKey: ['Account_no'],
        foreignKeys: [
          { column: 'Bank_Id', refTable: 'Bank', refColumn: 'Bank_Id' },
          { column: 'AccHolder_Id', refTable: 'Customers', refColumn: 'AccHolder_Id' },
        ],
        columns: [
          { name: 'Account_no', type: 'TEXT', key: 'PK', constraint: 'PRIMARY KEY' },
          { name: 'Account_Type', type: 'TEXT', key: null, constraint: 'NOT NULL' },
          { name: 'Balance', type: 'REAL', key: null, constraint: 'DEFAULT 0' },
          { name: 'Status', type: 'TEXT', key: null, constraint: 'NOT NULL' },
          { name: 'Date_Opened', type: 'TEXT', key: null, constraint: 'NOT NULL' },
          { name: 'IFSC_code', type: 'TEXT', key: null, constraint: 'NOT NULL' },
          { name: 'Branch_code', type: 'TEXT', key: null, constraint: 'NOT NULL' },
          { name: 'Bank_Id', type: 'INTEGER', key: 'FK', constraint: 'REFERENCES Bank(Bank_Id) ON DELETE CASCADE' },
          { name: 'AccHolder_Id', type: 'INTEGER', key: 'FK', constraint: 'REFERENCES Customers(AccHolder_Id) ON DELETE CASCADE' },
        ],
      },
      LinkedCards: {
        primaryKey: ['Card_no'],
        foreignKeys: [
          { column: 'Account_no', refTable: 'BankAccount', refColumn: 'Account_no' },
        ],
        columns: [
          { name: 'Card_no', type: 'TEXT', key: 'PK', constraint: 'PRIMARY KEY' },
          { name: 'Account_no', type: 'TEXT', key: 'FK', constraint: 'REFERENCES BankAccount(Account_no) ON DELETE CASCADE' },
        ],
      },
      Txn: {
        primaryKey: ['Transaction_id'],
        foreignKeys: [
          { column: 'Account_no', refTable: 'BankAccount', refColumn: 'Account_no' },
          { column: 'AccHolder_Id', refTable: 'Customers', refColumn: 'AccHolder_Id' },
        ],
        columns: [
          { name: 'Transaction_id', type: 'INTEGER', key: 'PK', constraint: 'PRIMARY KEY AUTOINCREMENT' },
          { name: 'Transaction_type', type: 'TEXT', key: null, constraint: 'NOT NULL' },
          { name: 'Currency', type: 'TEXT', key: null, constraint: "DEFAULT 'INR'" },
          { name: 'Amount', type: 'REAL', key: null, constraint: 'NOT NULL' },
          { name: 'Transaction_date', type: 'TEXT', key: null, constraint: 'NOT NULL' },
          { name: 'Account_no', type: 'TEXT', key: 'FK', constraint: 'REFERENCES BankAccount(Account_no) ON DELETE CASCADE' },
          { name: 'AccHolder_Id', type: 'INTEGER', key: 'FK', constraint: 'REFERENCES Customers(AccHolder_Id) ON DELETE CASCADE' },
        ],
      },
    };
    res.json(schema);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── 3. JOIN Queries ────────────────────────────────────────────────────────
router.get('/joins', (req, res) => {
  try {
    const joins = {
      // JOIN 1: Full account holder profile — Customers ⋈ BankAccount ⋈ Bank
      customerAccountProfile: {
        sql: `SELECT c.AccHolder_Id, c.FirstName || ' ' || c.LastName AS full_name,
       c.Age, c.Sex, ba.Account_no, ba.Account_Type, ba.Balance, ba.Status,
       ba.Date_Opened, ba.IFSC_code, ba.Branch_code,
       b.name AS bank_name, b.location AS bank_location
FROM Customers c
JOIN BankAccount ba ON c.AccHolder_Id = ba.AccHolder_Id
JOIN Bank b ON ba.Bank_Id = b.Bank_Id
ORDER BY c.AccHolder_Id`,
        description: 'INNER JOIN: Customers ⋈ BankAccount ⋈ Bank — Full account holder profile',
        data: queryAll(`
          SELECT c.AccHolder_Id,
            c.FirstName || ' ' || COALESCE(NULLIF(c.MiddleName,''),'') || ' ' || c.LastName AS full_name,
            c.Age, c.Sex,
            ba.Account_no, ba.Account_Type, ba.Balance, ba.Status,
            ba.Date_Opened, ba.IFSC_code, ba.Branch_code,
            b.name AS bank_name, b.location AS bank_location
          FROM Customers c
          JOIN BankAccount ba ON c.AccHolder_Id = ba.AccHolder_Id
          JOIN Bank b ON ba.Bank_Id = b.Bank_Id
          ORDER BY c.AccHolder_Id
        `),
      },

      // JOIN 2: Full transaction details — Txn ⋈ BankAccount ⋈ Customers ⋈ Bank
      transactionDetails: {
        sql: `SELECT t.Transaction_id, t.Transaction_type, t.Currency, t.Amount, t.Transaction_date,
       t.Account_no, c.FirstName || ' ' || c.LastName AS customer_name,
       c.Age, c.Sex, ba.Account_Type, ba.Balance AS current_balance,
       ba.Status AS account_status, b.name AS bank_name, b.location AS bank_location
FROM Txn t
JOIN BankAccount ba ON t.Account_no = ba.Account_no
JOIN Customers c ON t.AccHolder_Id = c.AccHolder_Id
JOIN Bank b ON ba.Bank_Id = b.Bank_Id
ORDER BY t.Transaction_id DESC`,
        description: 'INNER JOIN (4 tables): Txn ⋈ BankAccount ⋈ Customers ⋈ Bank — Complete transaction ledger',
        data: queryAll(`
          SELECT t.Transaction_id, t.Transaction_type, t.Currency, t.Amount,
            t.Transaction_date, t.Account_no,
            c.FirstName || ' ' || c.LastName AS customer_name,
            c.Age, c.Sex, ba.Account_Type,
            ba.Balance AS current_balance, ba.Status AS account_status,
            b.name AS bank_name, b.location AS bank_location
          FROM Txn t
          JOIN BankAccount ba ON t.Account_no   = ba.Account_no
          JOIN Customers   c  ON t.AccHolder_Id = c.AccHolder_Id
          JOIN Bank        b  ON ba.Bank_Id     = b.Bank_Id
          ORDER BY t.Transaction_id DESC
        `),
      },

      // JOIN 3: Customer aggregate summary — LEFT JOIN for customers with no txns
      customerSummary: {
        sql: `SELECT c.AccHolder_Id, c.FirstName || ' ' || c.LastName AS full_name,
       c.Age, c.Sex,
       COUNT(DISTINCT ba.Account_no) AS total_accounts,
       COALESCE(SUM(ba.Balance), 0) AS total_balance,
       COUNT(DISTINCT t.Transaction_id) AS total_transactions,
       COALESCE(SUM(CASE WHEN t.Transaction_type='Credit'  THEN t.Amount ELSE 0 END),0) AS total_credits,
       COALESCE(SUM(CASE WHEN t.Transaction_type='Debit'   THEN t.Amount ELSE 0 END),0) AS total_debits,
       COALESCE(SUM(CASE WHEN t.Transaction_type='Payment' THEN t.Amount ELSE 0 END),0) AS total_payments
FROM Customers c
LEFT JOIN BankAccount ba ON c.AccHolder_Id = ba.AccHolder_Id
LEFT JOIN Txn t ON c.AccHolder_Id = t.AccHolder_Id
GROUP BY c.AccHolder_Id ORDER BY total_balance DESC`,
        description: 'LEFT JOIN: Customers ⋉ BankAccount ⋉ Txn — Customer summary with aggregated totals (includes customers with no transactions)',
        data: queryAll(`
          SELECT c.AccHolder_Id,
            c.FirstName || ' ' || c.LastName AS full_name,
            c.Age, c.Sex,
            COUNT(DISTINCT ba.Account_no)    AS total_accounts,
            COALESCE(SUM(ba.Balance), 0)     AS total_balance,
            COUNT(DISTINCT t.Transaction_id) AS total_transactions,
            COALESCE(SUM(CASE WHEN t.Transaction_type='Credit'   THEN t.Amount ELSE 0 END),0) AS total_credits,
            COALESCE(SUM(CASE WHEN t.Transaction_type='Debit'    THEN t.Amount ELSE 0 END),0) AS total_debits,
            COALESCE(SUM(CASE WHEN t.Transaction_type='Transfer' THEN t.Amount ELSE 0 END),0) AS total_transfers,
            COALESCE(SUM(CASE WHEN t.Transaction_type='Payment'  THEN t.Amount ELSE 0 END),0) AS total_payments
          FROM Customers c
          LEFT JOIN BankAccount ba ON c.AccHolder_Id = ba.AccHolder_Id
          LEFT JOIN Txn         t  ON c.AccHolder_Id = t.AccHolder_Id
          GROUP BY c.AccHolder_Id
          ORDER BY total_balance DESC
        `),
      },

      // JOIN 4: Accounts with linked cards — LEFT JOIN (show accounts even without cards)
      accountsWithCards: {
        sql: `SELECT ba.Account_no, ba.Account_Type, ba.Balance, ba.Status, ba.IFSC_code,
       c.FirstName || ' ' || c.LastName AS holder_name,
       b.name AS bank_name, lc.Card_no
FROM BankAccount ba
JOIN Customers c ON ba.AccHolder_Id = c.AccHolder_Id
JOIN Bank b ON ba.Bank_Id = b.Bank_Id
LEFT JOIN LinkedCards lc ON ba.Account_no = lc.Account_no
ORDER BY ba.Account_no`,
        description: 'LEFT JOIN: BankAccount ⋈ Customers ⋈ Bank ⋉ LinkedCards — All accounts with their linked debit/credit cards',
        data: queryAll(`
          SELECT ba.Account_no, ba.Account_Type, ba.Balance, ba.Status, ba.IFSC_code,
            c.FirstName || ' ' || c.LastName AS holder_name,
            b.name AS bank_name, lc.Card_no
          FROM BankAccount ba
          JOIN Customers c    ON ba.AccHolder_Id = c.AccHolder_Id
          JOIN Bank      b    ON ba.Bank_Id = b.Bank_Id
          LEFT JOIN LinkedCards lc ON ba.Account_no = lc.Account_no
          ORDER BY ba.Account_no
        `),
      },
    };
    res.json(joins);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── 4. Triggers Info ──────────────────────────────────────────────────────
router.get('/triggers', (req, res) => {
  try {
    const triggerDefs = queryAll(`
      SELECT name, sql
      FROM sqlite_master
      WHERE type = 'trigger'
      ORDER BY name
    `);

    const txnLog = queryAll(`
      SELECT tl.*, c.FirstName || ' ' || c.LastName AS customer_name
      FROM TransactionLog tl
      LEFT JOIN Txn t ON tl.Transaction_id = t.Transaction_id
      LEFT JOIN Customers c ON t.AccHolder_Id = c.AccHolder_Id
      ORDER BY tl.log_id DESC LIMIT 50
    `);

    const accLog = queryAll(`
      SELECT al.*,
        c.FirstName || ' ' || c.LastName AS holder_name,
        b.name AS bank_name
      FROM AccountAuditLog al
      LEFT JOIN BankAccount ba ON al.Account_no = ba.Account_no
      LEFT JOIN Customers   c  ON al.AccHolder_Id = c.AccHolder_Id
      LEFT JOIN Bank        b  ON al.Bank_Id = b.Bank_Id
      ORDER BY al.log_id DESC LIMIT 50
    `);

    res.json({ triggerDefs, txnLog, accLog });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── 5. Account Audit Log ──────────────────────────────────────────────────
router.get('/audit', (req, res) => {
  try {
    const data = queryAll(`
      SELECT al.*,
        c.FirstName || ' ' || c.LastName AS holder_name,
        b.name AS bank_name
      FROM AccountAuditLog al
      LEFT JOIN BankAccount ba ON al.Account_no  = ba.Account_no
      LEFT JOIN Customers   c  ON al.AccHolder_Id = c.AccHolder_Id
      LEFT JOIN Bank        b  ON al.Bank_Id      = b.Bank_Id
      ORDER BY al.log_id DESC
    `);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── 6. Cursor Simulation ──────────────────────────────────────────────────
// SQLite has no native cursor/stored-procedure, so we simulate it here:
// DECLARE cur CURSOR FOR SELECT ... → OPEN → FETCH row-by-row → process → CLOSE
router.get('/cursor', (req, res) => {
  try {
    const customers = queryAll('SELECT * FROM Customers ORDER BY AccHolder_Id');
    const result = [];

    customers.forEach(cust => {
      // OPEN cursor: fetch all rows for this customer
      const txns = queryAll(`
        SELECT t.Transaction_id, t.Transaction_type, t.Amount, t.Transaction_date,
               t.Account_no, t.Currency, ba.Balance AS current_balance,
               b.name AS bank_name
        FROM Txn t
        JOIN BankAccount ba ON t.Account_no = ba.Account_no
        JOIN Bank        b  ON ba.Bank_Id   = b.Bank_Id
        WHERE t.AccHolder_Id = ?
        ORDER BY t.Transaction_date ASC, t.Transaction_id ASC
      `, [cust.AccHolder_Id]);

      let runningBalance = 0;
      const rows = [];

      // FETCH each row (cursor iteration)
      txns.forEach((txn, idx) => {
        const prev = runningBalance;
        if (txn.Transaction_type === 'Credit') runningBalance += txn.Amount;
        else if (txn.Transaction_type === 'Debit') runningBalance -= txn.Amount;
        else if (txn.Transaction_type === 'Payment') runningBalance -= txn.Amount;
        // Transfer = neutral for running balance

        rows.push({
          cursor_row: idx + 1,
          Transaction_id: txn.Transaction_id,
          type: txn.Transaction_type,
          currency: txn.Currency,
          amount: txn.Amount,
          date: txn.Transaction_date,
          bank_name: txn.bank_name,
          account_no: txn.Account_no,
          prev_balance: parseFloat(prev.toFixed(2)),
          running_balance: parseFloat(runningBalance.toFixed(2)),
          delta: parseFloat((runningBalance - prev).toFixed(2)),
          flag: runningBalance < 0 ? 'OVERDRAFT' : 'OK',
        });
      });

      // CLOSE cursor — push summary
      result.push({
        customer: `${cust.FirstName} ${cust.LastName}`,
        AccHolder_Id: cust.AccHolder_Id,
        sex: cust.Sex,
        age: cust.Age,
        rows,
        final_running_balance: parseFloat(runningBalance.toFixed(2)),
        transaction_count: rows.length,
      });
    });

    res.json({
      description: 'Simulated cursor: DECLARE cur CURSOR FOR SELECT t.* FROM Txn t WHERE AccHolder_Id = ? ORDER BY Transaction_date; OPEN cur; FETCH each row → compute running balance; CLOSE cur;',
      pseudocode: [
        'DECLARE cur CURSOR FOR SELECT * FROM Txn WHERE AccHolder_Id = ? ORDER BY Transaction_date',
        'OPEN cur',
        'LOOP',
        '  FETCH cur INTO @txn_row',
        '  EXIT WHEN cur%NOTFOUND',
        '  IF @txn_row.type = "Credit"  THEN SET running_balance = running_balance + @txn_row.Amount',
        '  IF @txn_row.type = "Debit"   THEN SET running_balance = running_balance - @txn_row.Amount',
        '  IF @txn_row.type = "Payment" THEN SET running_balance = running_balance - @txn_row.Amount',
        'END LOOP',
        'CLOSE cur',
      ],
      result,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
