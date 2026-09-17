const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../clinic.db'));

// SQLite performance and FK consistency pragmas
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize clinic tables
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
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
    status TEXT CHECK(status IN ('SCHEDULED', 'CANCELLED', 'COMPLETED', 'BUMPED')) DEFAULT 'SCHEDULED',
    priority TEXT CHECK(priority IN ('REGULAR', 'EMERGENCY')) DEFAULT 'REGULAR',
    cancellation_fee REAL DEFAULT 0.0,
    cancelled_at DATETIME NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(doctor_id) REFERENCES doctors(id)
  );

  CREATE INDEX IF NOT EXISTS idx_appts_doc_time ON appointments(doctor_id, start_time, end_time);
  CREATE INDEX IF NOT EXISTS idx_appts_patient ON appointments(patient_name);
`);

// Default system settings (ready for mid-round twists)
const insertSetting = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
insertSetting.run('buffer_minutes', '0');
insertSetting.run('late_cancel_threshold_hours', '24');
insertSetting.run('late_cancel_flat_fee', '25.00');

module.exports = db;