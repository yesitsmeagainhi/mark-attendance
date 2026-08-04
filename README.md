# Employee Attendance System

Responsive employee attendance application for Android, iPhone, tablet, and desktop browsers. Employees sign in to a protected dashboard, capture a front-camera selfie, and punch attendance. Administrators use a separate protected dashboard to review server timestamps and privately stored selfies.

## Included

- Separate employee and administrator login entry points
- Server-side role checks for pages and APIs
- Front-camera capture using `getUserMedia`
- Punch-in API with a server-generated timestamp
- Duplicate same-day punch protection
- D1 database tables for employees and attendance
- Private R2 selfie storage; photos are served only through an admin-authorized API
- JPEG, PNG, and WebP validation with a 5 MB limit
- Responsive employee and admin dashboards

## Project structure

```text
app/
  admin/page.tsx                  Protected admin page
  employee/page.tsx               Protected employee page
  api/attendance/route.ts         Punch creation and admin records API
  api/attendance/photo/route.ts   Protected selfie retrieval API
  authz.ts                        Server-side identity and role authorization
  chatgpt-auth.ts                 Sign-in helpers
  dashboard-client.tsx            Camera, employee, and admin interface
  globals.css                     Responsive styling
db/schema.ts                      Drizzle database schema
drizzle/0000_flowery_devos.sql    Initial database migration
worker/index.ts                   Cloudflare worker entry
.openai/hosting.json              D1 and R2 bindings
```

## Requirements

- Node.js 22.13 or later
- HTTPS in production (mobile browsers require a secure context for camera access)
- A D1-compatible database bound as `DB`
- An R2-compatible private bucket bound as `BUCKET`

## Run locally

```bash
npm ci
npm run dev
```

Open the local URL displayed in the terminal. Camera permissions may require HTTPS when testing from another phone; `localhost` is treated as secure by most desktop browsers.

## Database setup

Apply `drizzle/0000_flowery_devos.sql` to create the `employees` and `attendance` tables. Add employees with unique IDs and the exact email they use to sign in:

```sql
INSERT INTO employees (id, name, email, role, office, active)
VALUES ('EMP-1001', 'Employee Name', 'employee@company.com', 'employee', 'Airoli Office', 1);
```

Add an administrator by setting `role` to `admin`. The deployed demo also contains an owner-admin allowlist entry in `app/authz.ts`; replace `OWNER_ADMIN_EMAIL` with the required administrator email or remove that special case and manage every account through the database.

## Authentication

The hosted version uses dispatcher-managed sign-in and receives the verified user email through a server header. Authorization is still enforced in `app/authz.ts` and every protected API.

If deploying outside this hosting environment, connect your preferred authentication provider (Firebase Authentication, Auth0, Clerk, Cognito, or a secure server-session implementation), then update `getChatGPTUser()` to return the provider-verified email. Do not accept a role or employee ID directly from the browser.

## Production notes

- Keep the selfie bucket private.
- Serve the application only over HTTPS.
- Add CSRF protection if switching to cookie-based custom authentication.
- Add rate limiting, login audit logs, retention rules, backups, and employee consent/privacy notices.
- Store office and shift settings in the database rather than relying on the current demonstration values.
- Add punch-out selection/history, employee management, date filters, CSV export, and pagination before a large rollout.

## Commands

```bash
npm run lint
npm run build
npm run validate:artifact
npm run db:generate
```
