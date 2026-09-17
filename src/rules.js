const db = require('./db');

function getSetting(key, fallback) {
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key);
  return row ? row.value : fallback;
}

// Current clock helper (simulated clock support)
function getCurrentTime() {
  const clock = db.prepare(`SELECT simulated_time FROM system_clock WHERE id = 1`).get();
  return clock ? new Date(clock.simulated_time) : new Date();
}

/**
 * Level 1: Overlap & Conflict Check (Supports excluding appointment ID for Rescheduling)
 */
function checkBookingConflict(doctorId, startTimeISO, endTimeISO, excludeApptId = null) {
  const bufferMinutes = parseInt(getSetting('buffer_minutes', '0'), 10);
  const start = new Date(startTimeISO);
  const end = new Date(endTimeISO);

  const bufferedStart = new Date(start.getTime() - bufferMinutes * 60000).toISOString();
  const bufferedEnd = new Date(end.getTime() + bufferMinutes * 60000).toISOString();

  let query = `
    SELECT * FROM appointments
    WHERE doctor_id = ?
      AND status = 'SCHEDULED'
      AND (datetime(start_time) < datetime(?))
      AND (datetime(end_time) > datetime(?))
  `;
  const params = [doctorId, bufferedEnd, bufferedStart];

  if (excludeApptId) {
    query += ` AND id != ?`;
    params.push(excludeApptId);
  }

  return db.prepare(query).get(...params);
}

/**
 * Fair Cancellation Fee
 */
function calculateCancellationFee(appointment) {
  const now = getCurrentTime();
  const appointmentStart = new Date(appointment.start_time);
  const hoursRemaining = (appointmentStart - now) / (1000 * 60 * 60);

  const thresholdHours = parseFloat(getSetting('late_cancel_threshold_hours', '24'));
  const flatFee = parseFloat(getSetting('late_cancel_flat_fee', '25.00'));

  if (hoursRemaining >= thresholdHours) {
    return {
      fee: 0.0,
      reason: `Cancelled with ${hoursRemaining.toFixed(1)}h notice. Free cancellation applied.`
    };
  }

  return {
    fee: flatFee,
    reason: `Late cancellation (<${thresholdHours}h notice). Applied $${flatFee.toFixed(2)} fee.`
  };
}

/**
 * Level 2: Morning Reminder Dispatcher
 */
function dispatchMorningReminders(simulatedDateStr, timestampISO) {
  // Find all scheduled appointments on this calendar date
  const appointmentsToday = db.prepare(`
    SELECT a.*, d.name as doctor_name
    FROM appointments a
    JOIN doctors d ON a.doctor_id = d.id
    WHERE date(a.start_time) = date(?)
      AND a.status = 'SCHEDULED'
  `).all(simulatedDateStr);

  const insertOutbox = db.prepare(`
    INSERT INTO outbox (recipient, phone, message, appointment_id, sent_at, type)
    VALUES (?, ?, ?, ?, ?, 'MORNING_REMINDER')
  `);

  let dispatched = 0;
  for (const appt of appointmentsToday) {
    // Prevent duplicate reminders for the same appointment on the same day
    const alreadySent = db.prepare(`
      SELECT id FROM outbox
      WHERE appointment_id = ? AND date(sent_at) = date(?) AND type = 'MORNING_REMINDER'
    `).get(appt.id, simulatedDateStr);

    if (!alreadySent) {
      const msg = `Reminder: Hello ${appt.patient_name}, you have an appointment with ${appt.doctor_name} today at ${new Date(appt.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}.`;
      insertOutbox.run(appt.patient_name, appt.patient_phone, msg, appt.id, timestampISO);
      dispatched++;
    }
  }
  return dispatched;
}

/**
 * Level 3: Auto No-Show Evaluator (30 minutes after start_time if not completed)
 */
function evaluateNoShows(currentSimulatedTime) {
  // 30 minutes in milliseconds
  const cutoffTime = new Date(currentSimulatedTime.getTime() - 30 * 60 * 1000).toISOString();

  // Find SCHEDULED appointments where start_time <= cutoffTime (i.e. start was >= 30m ago)
  const stmt = db.prepare(`
    UPDATE appointments
    SET status = 'NO_SHOW'
    WHERE status = 'SCHEDULED'
      AND datetime(start_time) <= datetime(?)
  `);
  const result = stmt.run(cutoffTime);
  return result.changes;
}

module.exports = {
  getCurrentTime,
  checkBookingConflict,
  calculateCancellationFee,
  dispatchMorningReminders,
  evaluateNoShows
};