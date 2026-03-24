/**
 * Jampot Technologies — API Server
 * Visitor tracking, email capture, and dashboard data
 *
 * Tech Stack: Node.js · Express · better-sqlite3
 * Run:  node server.js
 * Port: 3000 (configurable via PORT env var)
 */

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'visitors.db');

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, '..'))); // Serve static site from parent dir

// CORS for development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ── Database Setup ──────────────────────────────────────────────────────────
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  TEXT UNIQUE NOT NULL,
    ip_hash     TEXT,
    user_agent  TEXT,
    language    TEXT,
    screen_w    INTEGER,
    screen_h    INTEGER,
    timezone    TEXT,
    referrer    TEXT,
    landing     TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at    DATETIME,
    total_ms    INTEGER DEFAULT 0,
    page_views  INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS page_views (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  TEXT NOT NULL,
    page        TEXT NOT NULL,
    pv_number   INTEGER DEFAULT 1,
    viewed_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(session_id)
  );

  CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  TEXT NOT NULL,
    event_name  TEXT NOT NULL,
    page        TEXT,
    properties  TEXT,
    occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS leads (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    email       TEXT UNIQUE NOT NULL,
    session_id  TEXT,
    source_page TEXT,
    source      TEXT DEFAULT 'time_on_site_capture',
    captured_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    contacted   INTEGER DEFAULT 0,
    notes       TEXT
  );

  CREATE TABLE IF NOT EXISTS heartbeats (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  TEXT NOT NULL,
    active_ms   INTEGER,
    current_page TEXT,
    beat_at     DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at);
  CREATE INDEX IF NOT EXISTS idx_pv_session ON page_views(session_id);
  CREATE INDEX IF NOT EXISTS idx_pv_page ON page_views(page);
  CREATE INDEX IF NOT EXISTS idx_leads_captured ON leads(captured_at);
`);

// ── Prepared Statements ──────────────────────────────────────────────────────
const stmts = {
  insertSession: db.prepare(`
    INSERT OR IGNORE INTO sessions 
    (session_id, ip_hash, user_agent, language, screen_w, screen_h, timezone, referrer, landing)
    VALUES (@sessionId, @ipHash, @userAgent, @language, @screenWidth, @screenHeight, @timezone, @referrer, @landingPage)
  `),

  insertPageView: db.prepare(`
    INSERT INTO page_views (session_id, page, pv_number) VALUES (@sessionId, @page, @pageViewNumber)
  `),

  updateSessionPageViews: db.prepare(`
    UPDATE sessions SET page_views = page_views + 1 WHERE session_id = @sessionId
  `),

  insertEvent: db.prepare(`
    INSERT INTO events (session_id, event_name, page, properties)
    VALUES (@sessionId, @event, @page, @properties)
  `),

  insertLead: db.prepare(`
    INSERT OR IGNORE INTO leads (email, session_id, source_page, source)
    VALUES (@email, @sessionId, @page, @source)
  `),

  insertHeartbeat: db.prepare(`
    INSERT INTO heartbeats (session_id, active_ms, current_page) VALUES (@sessionId, @activeTimeMs, @currentPage)
  `),

  endSession: db.prepare(`
    UPDATE sessions SET ended_at=CURRENT_TIMESTAMP, total_ms=@totalTimeMs, page_views=@pageViews
    WHERE session_id=@sessionId
  `),
};

// ── Helper: hash IP for privacy ──────────────────────────────────────────────
function hashIp(ip) {
  return crypto.createHash('sha256').update(ip + 'jampot_salt_2026').digest('hex').substr(0, 16);
}

// ── API Routes ────────────────────────────────────────────────────────────────

// POST /api/session — Register new session
app.post('/api/session', (req, res) => {
  try {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    stmts.insertSession.run({ ...req.body, ipHash: hashIp(ip) });
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false });
  }
});

// POST /api/pageview — Track a page view
app.post('/api/pageview', (req, res) => {
  try {
    stmts.insertPageView.run(req.body);
    stmts.updateSessionPageViews.run({ sessionId: req.body.sessionId });
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false });
  }
});

// POST /api/event — Track an event
app.post('/api/event', (req, res) => {
  try {
    stmts.insertEvent.run({
      ...req.body,
      properties: JSON.stringify(req.body),
    });
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false });
  }
});

// POST /api/lead — Capture email
app.post('/api/lead', (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ ok: false, error: 'Invalid email' });
    }
    stmts.insertLead.run(req.body);
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false });
  }
});

// POST /api/heartbeat — Active time ping
app.post('/api/heartbeat', (req, res) => {
  try {
    stmts.insertHeartbeat.run(req.body);
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false });
  }
});

// POST /api/session/end — Session ended
app.post('/api/session/end', (req, res) => {
  try {
    stmts.endSession.run(req.body);
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false });
  }
});

// ── Dashboard API ─────────────────────────────────────────────────────────────

// GET /api/dashboard/overview — High-level KPIs
app.get('/api/dashboard/overview', (req, res) => {
  const { days = 30 } = req.query;
  try {
    const since = `datetime('now', '-${parseInt(days)} days')`;
    const data = {
      totalSessions: db.prepare(`SELECT COUNT(*) as n FROM sessions WHERE created_at > ${since}`).get().n,
      uniqueToday: db.prepare(`SELECT COUNT(*) as n FROM sessions WHERE date(created_at)=date('now')`).get().n,
      uniqueThisWeek: db.prepare(`SELECT COUNT(*) as n FROM sessions WHERE created_at > datetime('now','-7 days')`).get().n,
      totalPageViews: db.prepare(`SELECT COUNT(*) as n FROM page_views WHERE viewed_at > ${since}`).get().n,
      totalLeads: db.prepare(`SELECT COUNT(*) as n FROM leads`).get().n,
      leadsThisMonth: db.prepare(`SELECT COUNT(*) as n FROM leads WHERE captured_at > ${since}`).get().n,
      avgSessionMs: db.prepare(`SELECT AVG(total_ms) as v FROM sessions WHERE total_ms > 0 AND created_at > ${since}`).get().v || 0,
      bounceRate: (() => {
        const total = db.prepare(`SELECT COUNT(*) as n FROM sessions WHERE created_at > ${since}`).get().n;
        const bounce = db.prepare(`SELECT COUNT(*) as n FROM sessions WHERE page_views <= 1 AND created_at > ${since}`).get().n;
        return total > 0 ? Math.round((bounce / total) * 100) : 0;
      })(),
    };
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/dashboard/daily — Daily visitor counts for chart (last N days)
app.get('/api/dashboard/daily', (req, res) => {
  const { days = 30 } = req.query;
  try {
    const rows = db.prepare(`
      SELECT date(created_at) as date, COUNT(*) as sessions, 
             SUM(page_views) as pageviews
      FROM sessions
      WHERE created_at > datetime('now', '-${parseInt(days)} days')
      GROUP BY date(created_at)
      ORDER BY date ASC
    `).all();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/dashboard/pages — Top pages
app.get('/api/dashboard/pages', (req, res) => {
  const { days = 30 } = req.query;
  try {
    const rows = db.prepare(`
      SELECT page, COUNT(*) as views
      FROM page_views
      WHERE viewed_at > datetime('now', '-${parseInt(days)} days')
      GROUP BY page
      ORDER BY views DESC
      LIMIT 20
    `).all();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/dashboard/referrers — Traffic sources
app.get('/api/dashboard/referrers', (req, res) => {
  const { days = 30 } = req.query;
  try {
    const rows = db.prepare(`
      SELECT 
        CASE 
          WHEN referrer = '' OR referrer = 'direct' THEN 'Direct'
          WHEN referrer LIKE '%google%' THEN 'Google'
          WHEN referrer LIKE '%linkedin%' THEN 'LinkedIn'
          WHEN referrer LIKE '%bing%' THEN 'Bing'
          ELSE 'Other'
        END as source,
        COUNT(*) as sessions
      FROM sessions
      WHERE created_at > datetime('now', '-${parseInt(days)} days')
      GROUP BY source
      ORDER BY sessions DESC
    `).all();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/dashboard/leads — Email leads list
app.get('/api/dashboard/leads', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT id, email, source_page, source, captured_at, contacted, notes
      FROM leads
      ORDER BY captured_at DESC
      LIMIT 200
    `).all();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/dashboard/recent — Recent sessions
app.get('/api/dashboard/recent', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT session_id, referrer, timezone, language, page_views, 
             total_ms, created_at, landing
      FROM sessions
      ORDER BY created_at DESC
      LIMIT 50
    `).all();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/dashboard/leads/:id — Update lead contact status
app.patch('/api/dashboard/leads/:id', (req, res) => {
  try {
    db.prepare(`UPDATE leads SET contacted=@contacted, notes=@notes WHERE id=@id`)
      .run({ id: req.params.id, contacted: req.body.contacted, notes: req.body.notes });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Serve Dashboard ───────────────────────────────────────────────────────────
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dashboard', 'index.html'));
});

// Catch-all — serve main site
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// ── Start Server ──────────────────────────────────────────────────────────────
if (!PORT) {
  console.error("PORT not defined!");
  process.exit(1);
}
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Jampot Technologies server running`);
  console.log(`Server running on port ${PORT}`);
  console.log(`   Dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`   Database:  ${DB_PATH}\n`);
});
