const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');
const { checkBookingConflict, calculateCancellationFee } = require('./rules');

const app = express();
const JWT_SECRET = 'clinic-platform-secret-key-2026';

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// JWT Authentication Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired session' });
    req.user = user;
    next();
  });
}

// Auth Routes
app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });

  try {
    const hashed = bcrypt.hashSync(password, 10);
    const stmt = db.prepare(`INSERT INTO users (name, email, password) VALUES (?, ?, ?)`);
    const result = stmt.run(name, email, hashed);
    res.status(201).json({ message: 'User registered successfully', userId: result.lastInsertRowid });
  } catch (err) {
    res.status(400).json({ error: 'Email already exists' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

// Doctors
app.get('/api/doctors', (req, res) => {
  res.json(db.prepare(`SELECT * FROM doctors`).all());
});

// Book Appointment with Overlap Prevention
app.post('/api/appointments', authenticateToken, (req, res) => {
  const { doctor_id, patient_name, patient_phone, start_time, end_time, priority = 'REGULAR' } = req.body;

  if (!doctor_id || !patient_name || !patient_phone || !start_time || !end_time) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const start = new Date(start_time);
  const end = new Date(end_time);

  if (start >= end) {
    return res.status(400).json({ error: 'Start time must be before end time' });
  }

  const conflict = checkBookingConflict(doctor_id, start.toISOString(), end.toISOString());
  if (conflict) {
    if (priority === 'EMERGENCY') {
      db.prepare(`UPDATE appointments SET status = 'BUMPED' WHERE id = ?`).run(conflict.id);
    } else {
      return res.status(409).json({
        error: `Conflict: Doctor is already booked between ${new Date(conflict.start_time).toLocaleTimeString()} and ${new Date(conflict.end_time).toLocaleTimeString()}.`,
        conflictWith: conflict
      });
    }
  }

  const insert = db.prepare(`
    INSERT INTO appointments (doctor_id, patient_name, patient_phone, start_time, end_time, priority, status)
    VALUES (?, ?, ?, ?, ?, ?, 'SCHEDULED')
  `);
  const result = insert.run(doctor_id, patient_name, patient_phone, start.toISOString(), end.toISOString(), priority);

  res.status(201).json({ message: 'Appointment booked successfully', appointmentId: result.lastInsertRowid });
});

// Cancel Appointment with Late Fee Calculation
app.patch('/api/appointments/:id/cancel', authenticateToken, (req, res) => {
  const appt = db.prepare(`SELECT * FROM appointments WHERE id = ?`).get(req.params.id);

  if (!appt) return res.status(404).json({ error: 'Appointment not found' });
  if (appt.status === 'CANCELLED') return res.status(400).json({ error: 'Already cancelled' });

  const { fee, reason } = calculateCancellationFee(appt);

  db.prepare(`
    UPDATE appointments
    SET status = 'CANCELLED', cancellation_fee = ?, cancelled_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(fee, req.params.id);

  res.json({ message: reason, cancellationFee: fee, appointmentId: req.params.id });
});

// Search, Filter, Sort, and Paginate Appointments
app.get('/api/appointments', authenticateToken, (req, res) => {
  let { search = '', doctor_id, sort_by = 'start_time', order = 'ASC', page = 1, limit = 5 } = req.query;

  page = parseInt(page) || 1;
  limit = parseInt(limit) || 5;
  const offset = (page - 1) * limit;

  const validSorts = ['start_time', 'patient_name', 'id'];
  const sortCol = validSorts.includes(sort_by) ? sort_by : 'start_time';
  const sortOrder = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  let whereClauses = ["(a.patient_name LIKE ? OR a.patient_phone LIKE ?)"];
  let params = [`%${search}%`, `%${search}%`];

  if (doctor_id) {
    whereClauses.push("a.doctor_id = ?");
    params.push(doctor_id);
  }

  const whereSQL = `WHERE ${whereClauses.join(' AND ')}`;

  const total = db.prepare(`SELECT COUNT(*) as count FROM appointments a ${whereSQL}`).get(...params).count;

  const appointments = db.prepare(`
    SELECT a.*, d.name as doctor_name, d.specialty
    FROM appointments a
    JOIN doctors d ON a.doctor_id = d.id
    ${whereSQL}
    ORDER BY a.${sortCol} ${sortOrder}
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  res.json({
    data: appointments,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1
    }
  });
});

// Doctor Day View
app.get('/api/doctors/:id/schedule', authenticateToken, (req, res) => {
  const doctorId = req.params.id;
  const date = req.query.date || new Date().toISOString().split('T')[0];

  const schedule = db.prepare(`
    SELECT * FROM appointments
    WHERE doctor_id = ?
      AND date(start_time) = date(?)
      AND status != 'CANCELLED'
    ORDER BY start_time ASC
  `).all(doctorId, date);

  res.json({ date, doctor_id: doctorId, appointments: schedule });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`CareSync running on http://localhost:${PORT}`);
});