const db = require('./db');
const bcrypt = require('bcryptjs');

function seed() {
  const insertUser = db.prepare(`INSERT OR IGNORE INTO users (name, email, password, role) VALUES (?, ?, ?, ?)`);
  const insertDoc = db.prepare(`INSERT OR IGNORE INTO doctors (name, specialty, work_start, work_end) VALUES (?, ?, ?, ?)`);

  const hashedPw = bcrypt.hashSync('desk123', 10);
  insertUser.run('Front Desk Admin', 'admin@clinic.com', hashedPw, 'desk');

  const doctors = [
    ['Dr. Sarah Jenkins', 'Cardiology', '09:00', '17:00'],
    ['Dr. Marcus Vance', 'Pediatrics', '08:30', '16:30'],
    ['Dr. Elena Rostova', 'General Medicine', '09:00', '18:00']
  ];

  for (const doc of doctors) {
    insertDoc.run(doc[0], doc[1], doc[2], doc[3]);
  }

  console.log('Database seeded: admin@clinic.com / desk123');
}

seed();