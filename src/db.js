const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../clinic.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS system_clock (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    simulated_time DATETIME NOT NULL,
    last_reminder_date TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'staff',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS doctors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    specialty TEXT NOT NULL,
    work_start TEXT DEFAULT '08:00',
    work_end TEXT DEFAULT '18:00'
  );

  CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doctor_id INTEGER NOT NULL,
    patient_name TEXT NOT NULL,
    patient_phone TEXT NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    status TEXT CHECK(status IN ('SCHEDULED', 'CANCELLED', 'COMPLETED', 'BUMPED', 'NO_SHOW')) DEFAULT 'SCHEDULED',
    priority TEXT CHECK(priority IN ('REGULAR', 'EMERGENCY')) DEFAULT 'REGULAR',
    cancellation_fee REAL DEFAULT 0.0,
    cancelled_at DATETIME NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(doctor_id) REFERENCES doctors(id)
  );

  -- Level 2 notification outbox table
  CREATE TABLE IF NOT EXISTS outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient TEXT NOT NULL,
    phone TEXT NOT NULL,
    message TEXT NOT NULL,
    appointment_id INTEGER,
    sent_at DATETIME NOT NULL,
    type TEXT DEFAULT 'MORNING_REMINDER',
    FOREIGN KEY(appointment_id) REFERENCES appointments(id)
  );

  CREATE INDEX IF NOT EXISTS idx_appts_doc_time ON appointments(doctor_id, start_time, end_time);
  CREATE INDEX IF NOT EXISTS idx_appts_patient ON appointments(patient_name);
`);

// Pre-load default clock & settings
const insertClock = db.prepare(`INSERT OR IGNORE INTO system_clock (id, simulated_time, last_reminder_date) VALUES (1, datetime('now'), '')`);
insertClock.run();

const insertSetting = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
insertSetting.run('buffer_minutes', '0');
insertSetting.run('late_cancel_threshold_hours', '24');
insertSetting.run('late_cancel_flat_fee', '25.00');

module.exports = db;