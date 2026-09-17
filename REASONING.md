# REASONING.md — Architecture Decisions, Testing, and Resolution

## 1. Problem Understanding and Design Decisions

The main purpose of CareSync is to solve two common problems faced by a busy clinic reception desk:

* **Double booking:** Two patients being booked with the same doctor at overlapping times.
* **Late cancellations:** Patients cancelling appointments at the last minute, leaving unused appointment slots and potentially affecting clinic revenue.

The system was designed to handle these problems automatically instead of relying on the receptionist to manually check everything.

### Appointment Conflict Prevention

The most important rule is that a doctor should never have two overlapping appointments.

Rather than checking this only on the frontend, CareSync performs the conflict check on the server while creating the appointment. The system looks for an existing scheduled appointment for the same doctor and checks whether its time overlaps with the requested time.

The basic overlap check is:

```sql
WHERE doctor_id = ?
  AND status = 'SCHEDULED'
  AND (datetime(start_time) < datetime(:requested_end))
  AND (datetime(end_time) > datetime(:requested_start))
```

If a conflicting appointment is found, the new appointment is rejected with an **HTTP 409 Conflict** response.

This approach makes the rule reliable because the server remains responsible for enforcing the scheduling constraint, even if multiple requests are made at nearly the same time.

### Cancellation Policy

CareSync also handles cancellation fees automatically.

The cancellation rule is kept separately in `src/rules.js` and uses values from the `settings` table. This makes the policy easier to change without having to rewrite the appointment logic.

The current policy is:

* **24 hours or more before the appointment:** No cancellation fee.
* **Less than 24 hours before the appointment:** A **$25.00 late cancellation fee** is applied.

This means the receptionist does not have to calculate the fee manually for every cancellation.

### Single-Process Application

The Express server also serves the frontend application.

This keeps the project simple because both the frontend and backend run through the same server and port. It avoids unnecessary CORS configuration and makes the application easier to run in environments such as **GitHub Codespaces**.

---

## 2. Testing and Verification

Several test cases were used to make sure the appointment conflict and cancellation rules work correctly.

### Test 1: Exact Same Time Slot

**Scenario:**

* Dr. Jenkins already has an appointment from **10:00 to 10:30**.
* Another patient tries to book Dr. Jenkins for the same **10:00 to 10:30** slot.

**Expected result:** The second appointment should not be created.

**Actual result:** The system rejected the booking with **HTTP 409 Conflict** and returned a conflict message.

---

### Test 2: Partial and Interior Overlap

**Scenario:**

* An existing appointment is scheduled from **14:00 to 15:00**.
* A new appointment is requested from **14:15 to 14:45**.

The new appointment falls completely inside the existing appointment.

**Expected result:** The booking should be rejected.

**Actual result:** The system correctly detected the overlap and rejected the appointment.

---

### Test 3: Back-to-Back Appointments

**Scenario:**

* An existing appointment runs from **11:00 to 11:30**.
* A new appointment is requested from **11:30 to 12:00**.

These appointments touch at exactly 11:30 but do not overlap.

**Expected result:** The second appointment should be allowed.

**Actual result:** The appointment was successfully booked.

This confirms that the system does not incorrectly treat two consecutive appointments as overlapping.

---

### Test 4: Cancellation Fee Threshold

The cancellation rule was also tested with different notice periods.

**Scenario 1:**

* Appointment cancelled **48 hours in advance**.
* **Fee:** $0.00

**Scenario 2:**

* Appointment cancelled **3 hours in advance**.
* **Fee:** $25.00

**Result:** The system correctly applies the cancellation fee based on how much notice the patient gives.

---

## 3. Final Verification

The tests confirm that the main scheduling rules work as expected:

* Overlapping appointments for the same doctor are rejected.
* Exact duplicate time slots are rejected.
* Appointments that are completely inside another appointment are rejected.
* Back-to-back appointments are allowed.
* Cancellation fees are automatically calculated based on the 24-hour rule.

These checks help ensure that the reception desk can manage appointments without accidentally double-booking doctors or manually calculating late cancellation fees.
