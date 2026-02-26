const express = require('express');
const router = express.Router();
const { queryAll, queryOne, runQuery } = require('../database');

router.get('/', (req, res) => {
    try {
        res.json(queryAll('SELECT * FROM Bank ORDER BY Bank_Id DESC'));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', (req, res) => {
    const row = queryOne('SELECT * FROM Bank WHERE Bank_Id=?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Bank not found' });
    res.json(row);
});

router.post('/', (req, res) => {
    const { name, location } = req.body;
    if (!name || !location) return res.status(400).json({ error: 'name and location required' });
    const info = runQuery('INSERT INTO Bank (name,location) VALUES (?,?)', [name, location]);
    res.status(201).json({ Bank_Id: info.lastInsertRowid, name, location });
});

router.put('/:id', (req, res) => {
    const { name, location } = req.body;
    runQuery('UPDATE Bank SET name=?,location=? WHERE Bank_Id=?', [name, location, req.params.id]);
    res.json({ updated: true });
});

router.delete('/:id', (req, res) => {
    runQuery('DELETE FROM Bank WHERE Bank_Id=?', [req.params.id]);
    res.json({ deleted: true });
});

module.exports = router;
