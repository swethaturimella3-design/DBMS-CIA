// routes/sessions.js — Live customer session / login activity tracking
const express = require('express');
const router = express.Router();
const { queryAll, queryOne, runQuery, save } = require('../database');

const CUSTOMER_NAMES = [
    null, // index 0 unused
    'Arjun Sharma', 'Priya Nair', 'Rohan Mehta', 'Ananya Krishnan',
    'Vikram Patel', 'Sneha Iyer', 'Aditya Joshi', 'Kavya Reddy',
    'Rahul Gupta', 'Meghna Pillai',
];

const IPS = [
    '103.21.244.10', '49.36.118.42', '117.96.75.234', '182.64.203.15',
    '103.55.10.81', '157.45.28.99', '59.178.112.5', '14.97.204.137',
    '106.193.76.20', '121.200.5.18', '150.107.36.81', '27.56.204.19',
];

const DEVICES = [
    'Web Browser', 'Mobile App (Android)', 'Mobile App (iOS)',
    'Web Browser', 'Mobile App (Android)', 'Web Browser',
];

const CITIES = [
    'Mumbai', 'Bangalore', 'Chennai', 'Delhi', 'Hyderabad',
    'Pune', 'Kolkata', 'Ahmedabad', 'Jaipur', 'Surat',
];

// ─── GET /api/sessions — recent sessions with customer info ──────────────────
router.get('/', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 30;
        const sessions = queryAll(`
            SELECT
                s.session_id, s.AccHolder_Id,
                c.FirstName || ' ' || c.LastName AS customer_name,
                c.Age, c.Sex,
                s.login_time, s.logout_time,
                s.ip_address, s.device, s.status, s.city,
                CASE
                    WHEN s.logout_time IS NOT NULL
                    THEN CAST((julianday(s.logout_time) - julianday(s.login_time)) * 1440 AS INTEGER)
                    ELSE NULL
                END AS duration_mins
            FROM CustomerSession s
            JOIN Customers c ON s.AccHolder_Id = c.AccHolder_Id
            ORDER BY s.session_id DESC
            LIMIT ?
        `, [limit]);
        res.json(sessions);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── GET /api/sessions/stats — summary stats for the live feed header ─────────
router.get('/stats', (req, res) => {
    try {
        const total = queryOne(`SELECT COUNT(*) as c FROM CustomerSession`);
        const active = queryOne(`SELECT COUNT(*) as c FROM CustomerSession WHERE status='Active'`);
        const today = queryOne(`SELECT COUNT(*) as c FROM CustomerSession WHERE date(login_time) = date('now','localtime')`);
        const unique = queryOne(`SELECT COUNT(DISTINCT AccHolder_Id) as c FROM CustomerSession WHERE status='Active'`);
        res.json({
            total: total?.c ?? 0,
            active: active?.c ?? 0,
            today: today?.c ?? 0,
            uniqueOnline: unique?.c ?? 0,
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── POST /api/sessions/simulate — inject a random login event ───────────────
router.post('/simulate', (req, res) => {
    try {
        const custIdx = Math.floor(Math.random() * 10) + 1;
        const ip = IPS[Math.floor(Math.random() * IPS.length)];
        const device = DEVICES[Math.floor(Math.random() * DEVICES.length)];
        const city = CITIES[Math.floor(Math.random() * CITIES.length)];
        const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

        runQuery(`
            INSERT INTO CustomerSession (AccHolder_Id, login_time, ip_address, device, status, city)
            VALUES (?, ?, ?, ?, 'Active', ?)
        `, [custIdx, now, ip, device, city]);

        const session = queryOne(`
            SELECT s.*, c.FirstName || ' ' || c.LastName AS customer_name
            FROM CustomerSession s JOIN Customers c ON s.AccHolder_Id = c.AccHolder_Id
            ORDER BY s.session_id DESC LIMIT 1
        `);
        res.json(session);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PATCH /api/sessions/:id/logout — close a session ───────────────────────
router.patch('/:id/logout', (req, res) => {
    try {
        const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
        runQuery(`
            UPDATE CustomerSession
            SET logout_time = ?, status = 'Closed'
            WHERE session_id = ? AND status = 'Active'
        `, [now, req.params.id]);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
