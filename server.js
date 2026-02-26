const express = require('express');
const cors = require('cors');
const path = require('path');
const { getDB, queryAll, queryOne, runQuery } = require('./database');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Wait for DB init before routes ─────────────────────────────────────────
getDB().then(() => {

    app.use('/api/banks', require('./routes/banks'));
    app.use('/api/customers', require('./routes/customers'));
    app.use('/api/accounts', require('./routes/accounts'));
    app.use('/api/transactions', require('./routes/transactions'));
    app.use('/api/schema', require('./routes/schema'));
    app.use('/api/sql', require('./routes/sql'));
    app.use('/api/sessions', require('./routes/sessions'));

    // Dedicated route to showcase any table's raw data for CIA evaluation
    app.get('/api/showcase/:tableName', (req, res) => {
        // Whitelist the tables so no one can inject malicious SQL
        const validTables = ['Bank', 'Customers', 'BankAccount', 'LinkedCards', 'Txn', 'TransactionLog', 'AccountAuditLog', 'CustomerSession'];
        const table = req.params.tableName;
        
        if (!validTables.includes(table)) {
            return res.status(400).json({ error: "Invalid table name" });
        }

        try {
            const data = queryAll(`SELECT * FROM ${table}`);
            res.json(data);
        } catch (e) { 
            res.status(500).json({ error: e.message }); 
        }
    });

    // Dashboard stats
    app.get('/api/stats', (req, res) => {
        try {
            const stats = {
                banks: queryOne('SELECT COUNT(*) as c FROM Bank').c,
                customers: queryOne('SELECT COUNT(*) as c FROM Customers').c,
                accounts: queryOne('SELECT COUNT(*) as c FROM BankAccount').c,
                transactions: queryOne('SELECT COUNT(*) as c FROM Txn').c,
                totalBalance: queryOne('SELECT COALESCE(SUM(Balance),0) as s FROM BankAccount').s,
                totalVolume: queryOne('SELECT COALESCE(SUM(Amount),0) as s FROM Txn').s,
            };
            res.json(stats);
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // SPA fallback
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    const PORT = process.env.PORT || 8080;
    app.listen(PORT, () => {
        console.log(`\n  🏦 Banking DBMS running at http://localhost:${PORT}\n`);
    });

}).catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
});