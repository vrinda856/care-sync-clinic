const db = require('./db');

function getSetting(key, fallback) {
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key);
  return row ? row.value : fallback;
}

// 1. Overlap Detection with Turnaround Buffer
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

// 2. Cancellation Fee Engine
function calculateCancellationFee(appointment) {
  const now = new Date();
  const appointmentStart = new Date(appointment.start_time);
  const hoursRemaining = (appointmentStart - now) / (1000 * 60 * 60);

  const thresholdHours = parseFloat(getSetting('late_cancel_threshold_hours', '24'));
  const flatFee = parseFloat(getSetting('late_cancel_flat_fee', '25.00'));

  if (hoursRemaining >= thresholdHours) {
    return {
      fee: 0.0,
      reason: `Cancelled with ${hoursRemaining.toFixed(1)}h notice (> ${thresholdHours}h required). Free cancellation.`
    };
  }

  // Tiered clause (in case twist requires urgent late cancellations)
  if (hoursRemaining < 2) {
    const urgentFee = flatFee * 1.5;
    return {
      fee: urgentFee,
      reason: `Cancelled with under 2h notice. Urgent late fee of $${urgentFee.toFixed(2)} applied.`
    };
  }

  return {
    fee: flatFee,
    reason: `Late cancellation under ${thresholdHours}h notice. Standard late fee of $${flatFee.toFixed(2)} applied.`
  };
}

module.exports = {
  getSetting,
  checkBookingConflict,
  calculateCancellationFee
};