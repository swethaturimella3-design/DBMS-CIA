const express = require('express');
const router = express.Router();
const { queryAll, queryOne, runQuery } = require('../database');

// GET all — full 4-table JOIN: Txn ⋈ BankAccount ⋈ Customers ⋈ Bank
router.get('/', (req, res) => {
    try {
        const rows = queryAll(`
      SELECT
        t.Transaction_id,
        t.Transaction_type,
        t.Currency,
        t.Amount,
        t.Transaction_date,
        t.Account_no,
        t.AccHolder_Id,
        c.FirstName,
        c.LastName,
        c.FirstName || ' ' || COALESCE(NULLIF(c.MiddleName,''),'') || ' ' || c.LastName AS customer_name,
        c.Age,
        c.Sex,
        ba.Account_Type,
        ba.Balance    AS current_balance,
        ba.Status     AS account_status,
        ba.IFSC_code,
        ba.Branch_code,
        ba.Bank_Id,
        b.name        AS bank_name,
        b.location    AS bank_location
      FROM Txn t
      JOIN BankAccount ba ON t.Account_no   = ba.Account_no
      JOIN Customers   c  ON t.AccHolder_Id = c.AccHolder_Id
      JOIN Bank        b  ON ba.Bank_Id     = b.Bank_Id
      ORDER BY t.Transaction_id DESC
    `);
        res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET single — same full JOIN
router.get('/:id', (req, res) => {
    try {
        const row = queryOne(`
      SELECT
        t.Transaction_id, t.Transaction_type, t.Currency, t.Amount, t.Transaction_date,
        t.Account_no, t.AccHolder_Id,
        c.FirstName, c.LastName,
        c.FirstName || ' ' || c.LastName AS customer_name,
        c.Age, c.Sex,
        ba.Account_Type, ba.Balance AS current_balance, ba.Status AS account_status,
        ba.IFSC_code, ba.Branch_code, ba.Bank_Id,
        b.name AS bank_name, b.location AS bank_location
      FROM Txn t
      JOIN BankAccount ba ON t.Account_no   = ba.Account_no
      JOIN Customers   c  ON t.AccHolder_Id = c.AccHolder_Id
      JOIN Bank        b  ON ba.Bank_Id     = b.Bank_Id
      WHERE t.Transaction_id = ?
    `, [req.params.id]);
        if (!row) return res.status(404).json({ error: 'Transaction not found' });
        res.json(row);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST — create new transaction (balance auto-updated by trigger)
router.post('/', (req, res) => {
    const { Transaction_type, Currency, Amount, Transaction_date, Account_no, AccHolder_Id } = req.body;
    if (!Transaction_type || !Amount || !Account_no || !AccHolder_Id)
        return res.status(400).json({ error: 'Transaction_type, Amount, Account_no, AccHolder_Id required' });
    try {
        const info = runQuery(
            'INSERT INTO Txn (Transaction_type,Currency,Amount,Transaction_date,Account_no,AccHolder_Id) VALUES (?,?,?,?,?,?)',
            [Transaction_type, Currency || 'INR', Amount,
                Transaction_date || new Date().toISOString().split('T')[0],
                Account_no, AccHolder_Id]
        );
        res.status(201).json({ Transaction_id: info.lastInsertRowid });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT — update transaction (balance auto-corrected by trigger)
router.put('/:id', (req, res) => {
    const { Transaction_type, Currency, Amount, Transaction_date, Account_no, AccHolder_Id } = req.body;
    try {
        runQuery(
            'UPDATE Txn SET Transaction_type=?,Currency=?,Amount=?,Transaction_date=?,Account_no=?,AccHolder_Id=? WHERE Transaction_id=?',
            [Transaction_type, Currency, Amount, Transaction_date, Account_no, AccHolder_Id, req.params.id]
        );
        res.json({ updated: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE — remove transaction (balance auto-reversed by trigger)
router.delete('/:id', (req, res) => {
    try {
        runQuery('DELETE FROM Txn WHERE Transaction_id=?', [req.params.id]);
        res.json({ deleted: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
