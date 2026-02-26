const express = require('express');
const router = express.Router();
const { queryAll, queryOne, runQuery } = require('../database');

router.get('/', (req, res) => {
    try {
        const rows = queryAll(`
      SELECT ba.*, b.name AS bank_name,
             c.FirstName || ' ' || c.LastName AS customer_name
      FROM BankAccount ba
      JOIN Bank b ON ba.Bank_Id = b.Bank_Id
      JOIN Customers c ON ba.AccHolder_Id = c.AccHolder_Id
      ORDER BY ba.Date_Opened DESC
    `);
        const withCards = rows.map(acc => {
            const cards = queryAll('SELECT Card_no FROM LinkedCards WHERE Account_no=?', [acc.Account_no]);
            return { ...acc, LinkedCards: cards.map(c => c.Card_no) };
        });
        res.json(withCards);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/accounts/openings — must come BEFORE /:acno ─────────────────────
router.get('/openings', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const rows = queryAll(`
            SELECT
                al.log_id, al.Account_no, al.new_balance, al.new_status, al.logged_at,
                ba.Account_Type, ba.IFSC_code, ba.Branch_code, ba.Date_Opened,
                b.name  AS bank_name,
                c.FirstName || ' ' || c.LastName AS customer_name,
                c.Age, c.Sex
            FROM AccountAuditLog al
            LEFT JOIN BankAccount  ba ON al.Account_no = ba.Account_no
            LEFT JOIN Customers    c  ON ba.AccHolder_Id = c.AccHolder_Id
            LEFT JOIN Bank         b  ON ba.Bank_Id = b.Bank_Id
            WHERE al.action = 'INSERT'
            ORDER BY al.log_id DESC
            LIMIT ?
        `, [limit]);
        res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/accounts/:acno ───────────────────────────────────────────────────
router.get('/:acno', (req, res) => {
    try {
        const row = queryOne(`
      SELECT ba.*, b.name AS bank_name,
             c.FirstName || ' ' || c.LastName AS customer_name
      FROM BankAccount ba
      JOIN Bank b ON ba.Bank_Id = b.Bank_Id
      JOIN Customers c ON ba.AccHolder_Id = c.AccHolder_Id
      WHERE ba.Account_no = ?
    `, [req.params.acno]);
        if (!row) return res.status(404).json({ error: 'Account not found' });
        const cards = queryAll('SELECT Card_no FROM LinkedCards WHERE Account_no=?', [req.params.acno]);
        res.json({ ...row, LinkedCards: cards.map(c => c.Card_no) });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', (req, res) => {
    const { Account_no, Account_Type, Balance, Status, Date_Opened, IFSC_code, Branch_code, Bank_Id, AccHolder_Id, LinkedCards: cards } = req.body;
    if (!Account_no || !Account_Type || !Status || !Date_Opened || !IFSC_code || !Branch_code || !Bank_Id || !AccHolder_Id)
        return res.status(400).json({ error: 'All account fields required' });
    try {
        runQuery(
            'INSERT INTO BankAccount (Account_no,Account_Type,Balance,Status,Date_Opened,IFSC_code,Branch_code,Bank_Id,AccHolder_Id) VALUES (?,?,?,?,?,?,?,?,?)',
            [Account_no, Account_Type, Balance || 0, Status, Date_Opened, IFSC_code, Branch_code, Bank_Id, AccHolder_Id]
        );
        if (Array.isArray(cards)) {
            cards.forEach(c => c && runQuery('INSERT OR IGNORE INTO LinkedCards (Card_no,Account_no) VALUES (?,?)', [c, Account_no]));
        }
        res.status(201).json({ Account_no });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:acno', (req, res) => {
    const { Account_Type, Balance, Status, Date_Opened, IFSC_code, Branch_code, Bank_Id, AccHolder_Id, LinkedCards: cards } = req.body;
    try {
        runQuery(
            'UPDATE BankAccount SET Account_Type=?,Balance=?,Status=?,Date_Opened=?,IFSC_code=?,Branch_code=?,Bank_Id=?,AccHolder_Id=? WHERE Account_no=?',
            [Account_Type, Balance, Status, Date_Opened, IFSC_code, Branch_code, Bank_Id, AccHolder_Id, req.params.acno]
        );
        if (Array.isArray(cards)) {
            runQuery('DELETE FROM LinkedCards WHERE Account_no=?', [req.params.acno]);
            cards.forEach(c => c && runQuery('INSERT OR IGNORE INTO LinkedCards (Card_no,Account_no) VALUES (?,?)', [c, req.params.acno]));
        }
        res.json({ updated: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/accounts/simulate — open a random realistic new account ────────
router.post('/simulate', (req, res) => {
    try {
        const banks = queryAll('SELECT Bank_Id, name, location FROM Bank');
        const customers = queryAll('SELECT AccHolder_Id, FirstName, LastName FROM Customers');
        if (!banks.length || !customers.length)
            return res.status(400).json({ error: 'No banks or customers found' });

        const bank = banks[Math.floor(Math.random() * banks.length)];
        const cust = customers[Math.floor(Math.random() * customers.length)];

        const types = ['Savings', 'Current', 'FD', 'RD'];
        const accType = types[Math.floor(Math.random() * types.length)];

        // Guaranteed-unique account number
        const ts = Date.now().toString().slice(-7);
        const prefix = bank.name.replace(/[^A-Z]/gi, '').substring(0, 4).toUpperCase();
        const acno = `${prefix}${ts}`;

        // Realistic IFSC and branch
        const ifscMap = { 1: 'SBIN0001234', 2: 'HDFC0002345', 3: 'ICIC0003456', 4: 'UTIB0004567' };
        const brchMap = { 1: 'BR001', 2: 'BR002', 3: 'BR003', 4: 'BR004' };
        const ifsc = ifscMap[bank.Bank_Id] || 'XXXX0000001';
        const branch = brchMap[bank.Bank_Id] || 'BR001';

        // Random opening balance ₹5,000 – ₹2,00,000
        const balance = Math.round((5000 + Math.random() * 195000) / 500) * 500;

        const today = new Date().toISOString().slice(0, 10);

        runQuery(
            `INSERT INTO BankAccount (Account_no,Account_Type,Balance,Status,Date_Opened,IFSC_code,Branch_code,Bank_Id,AccHolder_Id)
             VALUES (?,?,?,?,?,?,?,?,?)`,
            [acno, accType, balance, 'Active', today, ifsc, branch, bank.Bank_Id, cust.AccHolder_Id]
        );

        // Pull the audit log entry that was just auto-inserted by trigger
        const auditEntry = queryOne(`
            SELECT al.*, b.name AS bank_name,
                   c.FirstName || ' ' || c.LastName AS customer_name,
                   ba.Account_Type, ba.IFSC_code
            FROM AccountAuditLog al
            LEFT JOIN BankAccount ba ON al.Account_no = ba.Account_no
            LEFT JOIN Bank        b  ON ba.Bank_Id    = b.Bank_Id
            LEFT JOIN Customers   c  ON ba.AccHolder_Id = c.AccHolder_Id
            WHERE al.Account_no = ? AND al.action = 'INSERT'
            ORDER BY al.log_id DESC LIMIT 1
        `, [acno]);

        res.json({
            account_no: acno, account_type: accType, balance, bank_name: bank.name,
            customer_name: `${cust.FirstName} ${cust.LastName}`, audit: auditEntry
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:acno', (req, res) => {
    runQuery('DELETE FROM BankAccount WHERE Account_no=?', [req.params.acno]);
    res.json({ deleted: true });
});

module.exports = router;
