# CareSync – Conflict-Free Clinic Management System

CareSync is a clinic management system designed to make appointment scheduling easier and more reliable for reception desks.

It helps receptionists book appointments without accidentally double-booking a doctor, automatically handles cancellation fees based on the notice period, provides a clear daily schedule for each doctor, and makes it easy to find patient appointments using search and filters.

## Features

* **Conflict-free appointment booking** – Prevents two appointments for the same doctor from overlapping.
* **Turnaround time protection** – Ensures enough time is maintained between consecutive appointments.
* **Automatic cancellation fees** – No fee for cancellations made at least 24 hours in advance; a $25 fee is applied for late cancellations.
* **Doctor schedules** – View all active appointments for a doctor on a particular day.
* **Patient search** – Quickly find appointments using the patient's name or phone number.
* **Pagination and sorting** – Makes it easier to manage and browse large numbers of appointments.
* **Receptionist authentication** – Secure registration and login using JWT authentication.

---

## Setup and Run

### 1. Install Dependencies

After cloning the project, install the required packages:

```bash
npm install
```

### 2. Add Sample Data

To create the sample doctors, appointments, and receptionist account, run:

```bash
npm run seed
```

The default receptionist account is:

* **Email:** `admin@clinic.com`
* **Password:** `desk123`

### 3. Start the Application

Start the server using:

```bash
npm start
```

Once the server starts, open the application in your browser:

`http://localhost:3000`

---

## Debugging

If you need to debug the application:

* Check the terminal where the server is running for server logs and error messages.
* The SQLite database is stored in `clinic.db`.
* You can open `clinic.db` using any SQLite database viewer or inspect it through the command line.

---

## REST API

### Authentication

| Method | Endpoint             | Description                                            |
| ------ | -------------------- | ------------------------------------------------------ |
| POST   | `/api/auth/register` | Creates a new receptionist account.                    |
| POST   | `/api/auth/login`    | Logs in a receptionist and returns a JWT Bearer token. |

### Doctors

| Method | Endpoint                                    | Description                                                 |
| ------ | ------------------------------------------- | ----------------------------------------------------------- |
| GET    | `/api/doctors`                              | Returns all registered doctors and their specialties.       |
| GET    | `/api/doctors/:id/schedule?date=YYYY-MM-DD` | Returns a doctor's active appointments for a specific date. |

### Appointments

| Method | Endpoint                                                            | Description                                                                           |
| ------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| POST   | `/api/appointments`                                                 | Books an appointment while checking for doctor availability and scheduling conflicts. |
| GET    | `/api/appointments?search=&doctor_id=&sort_by=&order=&page=&limit=` | Retrieves appointments with search, filtering, sorting, and pagination.               |
| PATCH  | `/api/appointments/:id/cancel`                                      | Cancels an appointment and automatically calculates the applicable cancellation fee.  |

### Cancellation Policy

CareSync uses a simple cancellation policy:

* **24 hours or more before the appointment:** No cancellation fee.
* **Less than 24 hours before the appointment:** A **$25 late cancellation fee** is applied.

This keeps the policy consistent and removes the need for receptionists to calculate the fee manually.

---

## How the System Helps

The main goal of CareSync is to solve a common problem at busy clinics: **appointment conflicts**.

Before confirming an appointment, the system checks whether the doctor already has another appointment during the requested time. It also considers the required turnaround time between appointments. This prevents receptionists from accidentally booking overlapping appointments.

Receptionists can also quickly check a doctor's daily agenda, search for a patient's appointment, and handle cancellations without manually calculating penalties.

Overall, CareSync brings the important day-to-day tasks of a clinic reception desk into one simple system.


## Twist & Lifecycle Operations

CareSync also supports additional appointment lifecycle features such as rescheduling, simulated time, patient reminders, automatic no-show detection, and appointment completion.

### Reschedule an Appointment

**`PATCH /api/appointments/:id/reschedule`**

Reschedules an existing appointment to a new time slot while keeping the same doctor and patient.

**Request body:**

```json
{
  "start_time": "ISO_STRING",
  "end_time": "ISO_STRING"
}
```

Before rescheduling, CareSync checks the new time against the doctor's existing appointments. The appointment being rescheduled is excluded from the conflict check, so it does not conflict with itself.

This implements the **Level 1 twist**.

---

### Simulated Clinic Clock

**`POST /clock`** or **`POST /api/clock`**

The application includes a simulated clinic clock so time-based features can be tested without waiting for real time to pass.

You can either set a specific time:

```json
{
  "current_time": "2026-09-17T08:00:00Z"
}
```

or move the clock forward by a number of seconds:

```json
{
  "tick": 30
}
```

Advancing the clock automatically triggers the following lifecycle operations:

1. **Morning Reminders – Level 2**
   Reminder notifications are generated for the day's scheduled appointments and made available through the `/outbox` endpoint.

2. **Automatic No-Show Detection – Level 3**
   Any appointment that started more than 30 minutes ago is automatically marked as `NO_SHOW` if it has not already been completed.

---

### Get Current Simulated Time

**`GET /clock`**

Returns the current timestamp of the simulated clinic clock.

This is useful for testing time-dependent features such as reminders, cancellations, and no-show handling.

---

### View Reminder Notifications

**`GET /outbox`** or **`GET /api/outbox`**

Returns the patient reminder notifications that have been generated by the system.

This implements the **Level 2 twist** and provides a simple way to verify that reminders were dispatched correctly.

---

### Complete an Appointment

**`PATCH /api/appointments/:id/complete`**

Marks an appointment as `COMPLETED`.

Once an appointment is completed, it will not be automatically marked as `NO_SHOW`, even if the simulated clock is later advanced beyond the appointment's start time.

---

### Appointment Lifecycle

With these features, an appointment can move through a lifecycle such as:

**Scheduled → Completed**

or, if the patient does not attend:

**Scheduled → No Show**

An appointment can also be **rescheduled** while it is still active, with the same collision checks applied to the new time slot.

