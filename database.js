const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'banking.db');

let db;

async function getDB() {
  if (db) return db;

  const needsSeed = !fs.existsSync(DB_PATH);

  // better-sqlite3 reads/writes directly to the file safely! No more RAM buffering.
  db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');

  // ─── Schema (Upgraded with CHECK constraints) ────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS Bank (
      Bank_Id   INTEGER PRIMARY KEY AUTOINCREMENT,
      name      TEXT    NOT NULL,
      location  TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS Customers (
      AccHolder_Id  INTEGER PRIMARY KEY AUTOINCREMENT,
      FirstName     TEXT    NOT NULL,
      MiddleName    TEXT,
      LastName      TEXT    NOT NULL,
      Age           INTEGER NOT NULL,
      Sex           TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS BankAccount (
      Account_no    TEXT    PRIMARY KEY,
      Account_Type  TEXT    NOT NULL CHECK (Account_Type IN ('Savings', 'Current', 'FD', 'RD')),
      Balance       REAL    NOT NULL DEFAULT 0 CHECK (Balance >= 0),
      Status        TEXT    NOT NULL DEFAULT 'Active' CHECK (Status IN ('Active', 'Inactive', 'Closed')),
      Date_Opened   TEXT    NOT NULL,
      IFSC_code     TEXT    NOT NULL,
      Branch_code   TEXT    NOT NULL,
      Bank_Id       INTEGER NOT NULL REFERENCES Bank(Bank_Id) ON DELETE CASCADE,
      AccHolder_Id  INTEGER NOT NULL REFERENCES Customers(AccHolder_Id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS LinkedCards (
      Card_no     TEXT    PRIMARY KEY,
      Account_no  TEXT    NOT NULL REFERENCES BankAccount(Account_no) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS Txn (
      Transaction_id    INTEGER PRIMARY KEY AUTOINCREMENT,
      Transaction_type  TEXT    NOT NULL,
      Currency          TEXT    NOT NULL DEFAULT 'INR',
      Amount            REAL    NOT NULL CHECK (Amount > 0),
      Transaction_date  TEXT    NOT NULL,
      Account_no        TEXT    NOT NULL REFERENCES BankAccount(Account_no) ON DELETE CASCADE,
      AccHolder_Id      INTEGER NOT NULL REFERENCES Customers(AccHolder_Id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS TransactionLog (
      log_id         INTEGER PRIMARY KEY AUTOINCREMENT,
      action         TEXT    NOT NULL,
      Transaction_id INTEGER,
      Account_no     TEXT,
      new_amount     REAL,
      old_amount     REAL,
      txn_type       TEXT,
      logged_at      TEXT    DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS AccountAuditLog (
      log_id       INTEGER PRIMARY KEY AUTOINCREMENT,
      action       TEXT    NOT NULL,
      Account_no   TEXT,
      old_balance  REAL,
      new_balance  REAL,
      old_status   TEXT,
      new_status   TEXT,
      Bank_Id      INTEGER,
      AccHolder_Id INTEGER,
      logged_at    TEXT    DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS CustomerSession (
      session_id    INTEGER PRIMARY KEY AUTOINCREMENT,
      AccHolder_Id  INTEGER NOT NULL REFERENCES Customers(AccHolder_Id) ON DELETE CASCADE,
      login_time    TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      logout_time   TEXT,
      ip_address    TEXT    NOT NULL DEFAULT '0.0.0.0',
      device        TEXT    NOT NULL DEFAULT 'Web Browser',
      status        TEXT    NOT NULL DEFAULT 'Active',
      city          TEXT    DEFAULT 'Unknown'
    );
  `);

  // ─── Performance Indexes ──────────────────────────────────────────────────
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_account_customer ON BankAccount(AccHolder_Id);
    CREATE INDEX IF NOT EXISTS idx_txn_account ON Txn(Account_no);
    CREATE INDEX IF NOT EXISTS idx_txn_customer ON Txn(AccHolder_Id);
  `);

  // ─── SQLite Triggers ──────────────────────────────────────────────────────
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_after_txn_insert AFTER INSERT ON Txn
    BEGIN INSERT INTO TransactionLog (action, Transaction_id, Account_no, new_amount, txn_type)
    VALUES ('INSERT', NEW.Transaction_id, NEW.Account_no, NEW.Amount, NEW.Transaction_type); END;

    CREATE TRIGGER IF NOT EXISTS trg_after_txn_delete AFTER DELETE ON Txn
    BEGIN INSERT INTO TransactionLog (action, Transaction_id, Account_no, old_amount, txn_type)
    VALUES ('DELETE', OLD.Transaction_id, OLD.Account_no, OLD.Amount, OLD.Transaction_type); END;

    CREATE TRIGGER IF NOT EXISTS trg_after_txn_update AFTER UPDATE ON Txn
    BEGIN INSERT INTO TransactionLog (action, Transaction_id, Account_no, new_amount, old_amount, txn_type)
    VALUES ('UPDATE', NEW.Transaction_id, NEW.Account_no, NEW.Amount, OLD.Amount, NEW.Transaction_type); END;

    CREATE TRIGGER IF NOT EXISTS trg_balance_on_txn_insert AFTER INSERT ON Txn
    BEGIN UPDATE BankAccount SET Balance = Balance + CASE
      WHEN NEW.Transaction_type = 'Credit' THEN NEW.Amount
      WHEN NEW.Transaction_type = 'Debit' THEN -NEW.Amount
      WHEN NEW.Transaction_type = 'Payment' THEN -NEW.Amount ELSE 0 END
    WHERE Account_no = NEW.Account_no; END;

    CREATE TRIGGER IF NOT EXISTS trg_balance_on_txn_update AFTER UPDATE ON Txn
    BEGIN UPDATE BankAccount SET Balance = Balance - CASE 
      WHEN OLD.Transaction_type='Credit' THEN OLD.Amount
      WHEN OLD.Transaction_type='Debit' THEN -OLD.Amount
      WHEN OLD.Transaction_type='Payment' THEN -OLD.Amount ELSE 0 END
    + CASE WHEN NEW.Transaction_type='Credit' THEN NEW.Amount
      WHEN NEW.Transaction_type='Debit' THEN -NEW.Amount
      WHEN NEW.Transaction_type='Payment' THEN -NEW.Amount ELSE 0 END
    WHERE Account_no = NEW.Account_no; END;

    CREATE TRIGGER IF NOT EXISTS trg_balance_on_txn_delete AFTER DELETE ON Txn
    BEGIN UPDATE BankAccount SET Balance = Balance - CASE
      WHEN OLD.Transaction_type = 'Credit' THEN OLD.Amount
      WHEN OLD.Transaction_type = 'Debit' THEN -OLD.Amount
      WHEN OLD.Transaction_type = 'Payment' THEN -OLD.Amount ELSE 0 END
    WHERE Account_no = OLD.Account_no; END;

    CREATE TRIGGER IF NOT EXISTS trg_after_account_insert AFTER INSERT ON BankAccount
    BEGIN INSERT INTO AccountAuditLog (action, Account_no, new_balance, new_status, Bank_Id, AccHolder_Id)
    VALUES ('INSERT', NEW.Account_no, NEW.Balance, NEW.Status, NEW.Bank_Id, NEW.AccHolder_Id); END;

    CREATE TRIGGER IF NOT EXISTS trg_after_account_update AFTER UPDATE ON BankAccount
    BEGIN INSERT INTO AccountAuditLog (action, Account_no, old_balance, new_balance, old_status, new_status, Bank_Id, AccHolder_Id)
    VALUES ('UPDATE', NEW.Account_no, OLD.Balance, NEW.Balance, OLD.Status, NEW.Status, NEW.Bank_Id, NEW.AccHolder_Id); END;

    CREATE TRIGGER IF NOT EXISTS trg_after_account_delete AFTER DELETE ON BankAccount
    BEGIN INSERT INTO AccountAuditLog (action, Account_no, old_balance, old_status, Bank_Id, AccHolder_Id)
    VALUES ('DELETE', OLD.Account_no, OLD.Balance, OLD.Status, OLD.Bank_Id, OLD.AccHolder_Id); END;
  `);

  const countObj = queryOne('SELECT COUNT(*) as c FROM Bank');
  if (countObj && countObj.c === 0) seed();

  return db;
}

// better-sqlite3 writes instantly, so save() is now a blank dummy function 
// to prevent your existing routes from breaking when they call it!
function save() { }

function seed() {
  db.exec(`INSERT INTO Bank (name, location) VALUES ('State Bank of India','Mumbai'), ('HDFC Bank','Bangalore'), ('ICICI Bank','Chennai'), ('Axis Bank','Delhi');`);
  db.exec(`INSERT INTO Customers (FirstName,MiddleName,LastName,Age,Sex) VALUES ('Arjun','Kumar','Sharma',29,'Male'), ('Priya','','Nair',34,'Female'), ('Rohan','','Mehta',22,'Male'), ('Ananya','Rao','Krishnan',27,'Female'), ('Vikram','','Patel',41,'Male'), ('Sneha','','Iyer',25,'Female'), ('Aditya','Suresh','Joshi',38,'Male'), ('Kavya','','Reddy',30,'Female'), ('Rahul','Dev','Gupta',45,'Male'), ('Meghna','','Pillai',32,'Female');`);
  db.exec(`INSERT INTO BankAccount VALUES ('SBI0001001','Savings',120000.00,'Active','2021-06-15','SBIN0001234','BR001',1,1), ('SBI0001002','Current',55000.00,'Active','2022-03-10','SBIN0001234','BR001',1,2), ('HDFC000201','Current',310000.50,'Active','2019-03-22','HDFC0002345','BR002',2,2), ('HDFC000202','Savings',48500.00,'Active','2020-07-18','HDFC0002345','BR002',2,3), ('ICICI00301','Savings',22750.00,'Active','2023-11-01','ICIC0003456','BR003',3,4), ('ICICI00302','RD',15000.00,'Active','2023-01-05','ICIC0003456','BR003',3,5), ('AXIS000401','Savings',75000.00,'Active','2020-09-12','UTIB0004567','BR004',4,6), ('AXIS000402','Current',185000.00,'Active','2018-12-20','UTIB0004567','BR004',4,7), ('AXIS000403','FD',92000.00,'Active','2022-05-30','UTIB0004567','BR004',4,8), ('SBI0001003','Savings',37800.00,'Active','2023-08-15','SBIN0001234','BR001',1,9), ('SBI0001004','Savings',61500.00,'Inactive','2021-04-01','SBIN0001234','BR001',1,10), ('HDFC000203','Current',94000.00,'Active','2022-11-17','HDFC0002345','BR002',2,1), ('ICICI00303','Savings',28300.00,'Active','2024-01-20','ICIC0003456','BR003',3,3), ('AXIS000404','Savings',43200.00,'Active','2023-06-08','UTIB0004567','BR004',4,5), ('HDFC000204','FD',200000.00,'Active','2017-02-28','HDFC0002345','BR002',2,9);`);
  db.exec(`INSERT INTO LinkedCards VALUES ('4532 1234 5678 9010','SBI0001001'), ('5412 7534 1234 5678','HDFC000201'), ('4111 1111 1111 1111','AXIS000401'), ('3782 822463 10005','ICICI00301'), ('6011 1111 1111 1117','SBI0001003'), ('5500 0055 5555 5559','HDFC000203');`);
}

// ─── Drop-in compatible query helpers ───────────────────────────────────────
function queryAll(sql, params = []) {
  return db.prepare(sql).all(params);
}

function queryOne(sql, params = []) {
  return db.prepare(sql).get(params) || null;
}

function runQuery(sql, params = []) {
  const info = db.prepare(sql).run(params);
  return { lastInsertRowid: info.lastInsertRowid, changes: info.changes };
}

module.exports = { getDB, queryAll, queryOne, runQuery, save };