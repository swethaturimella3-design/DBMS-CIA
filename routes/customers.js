const express = require('express');
const router = express.Router();
const { queryAll, queryOne, runQuery } = require('../database');

router.get('/', (req, res) => {
    try {
        res.json(queryAll('SELECT * FROM Customers ORDER BY AccHolder_Id DESC'));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', (req, res) => {
    const row = queryOne('SELECT * FROM Customers WHERE AccHolder_Id=?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Customer not found' });
    res.json(row);
});

router.post('/', (req, res) => {
    const { FirstName, MiddleName, LastName, Age, Sex } = req.body;
    if (!FirstName || !LastName || !Age || !Sex)
        return res.status(400).json({ error: 'FirstName, LastName, Age, Sex required' });
    const info = runQuery(
        'INSERT INTO Customers (FirstName,MiddleName,LastName,Age,Sex) VALUES (?,?,?,?,?)',
        [FirstName, MiddleName || '', LastName, Age, Sex]
    );
    res.status(201).json({ AccHolder_Id: info.lastInsertRowid, ...req.body });
});

router.put('/:id', (req, res) => {
    const { FirstName, MiddleName, LastName, Age, Sex } = req.body;
    runQuery(
        'UPDATE Customers SET FirstName=?,MiddleName=?,LastName=?,Age=?,Sex=? WHERE AccHolder_Id=?',
        [FirstName, MiddleName || '', LastName, Age, Sex, req.params.id]
    );
    res.json({ updated: true });
});

router.delete('/:id', (req, res) => {
    runQuery('DELETE FROM Customers WHERE AccHolder_Id=?', [req.params.id]);
    res.json({ deleted: true });
});

module.exports = router;
