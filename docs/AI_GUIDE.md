# BKSB Eltern-/Ausbildersprechtag – AI Guide

Dieser Leitfaden hilft KI-Assistenzsystemen (und neuen Entwickler:innen), sich schnell im Projekt zurechtzufinden, sichere Änderungen vorzunehmen und konsistent zu arbeiten.

## Projektüberblick
- Frontend: React 19 + Vite 7 (`src/`), TypeScript 5.9, React Router 7, Context-basiertes Auth, zentraler API-Client.
- Backend: Node.js + Express (`backend/`), Supabase als DB, JWT-Auth, Nodemailer (E-Mail-Versand).
- Deployment: Vercel (Frontend), Render (Backend) – siehe `vercel.json`, `backend/render.yaml`.

## Lokales Setup
- Voraussetzungen: Node 20+ und npm.
- Env-Dateien:
  - `.env.example` → Frontend: `VITE_API_URL` (Standard: `http://localhost:4000/api`)
  - `backend/.env.example` → Backend: Supabase-Keys, PORT, SESSION_SECRET, SMTP-Config, `PUBLIC_BASE_URL`, `VERIFICATION_TOKEN_TTL_HOURS`
- Frontend starten:
  ```bash
  cd /workspaces/elternsprechtagNavi_01_12_2025
  npm install
  npm run dev   # Standard Port 5173, weicht bei Konflikt aus
  ```
- Backend starten:
  ```bash
  cd /workspaces/elternsprechtagNavi_01_12_2025/backend
  npm install
  # .env anhand von .env.example anlegen (Supabase-Keys, JWT-Secret, SMTP)
  npm run dev   # Port 4000 (node --watch index.js)
  ```

## Architektur & Schlüsseldateien

### Frontend
- `src/App.tsx`: Routing-Setup, Protected-Routes für Admin/Teacher. Enthält `GlobalTopHeader`, `AppErrorBoundary`, `Footer`.
- `src/main.tsx`: Root-Render (`StrictMode`); kein globaler Toast-Provider.
- `src/components/GlobalTopHeader.tsx`: **Haupt-App-Header** – Navigation, Nutzerinfo, Sidebar, Bereichs-Labels, View-Switching für Dual-Rollen-Nutzer.
- `src/components/AppErrorBoundary.tsx`: Globale ErrorBoundary um die App-Routen.
- `src/components/Header.tsx`: Re-Export-Alias auf `ExperimentalHeader` (historisch; nicht direkt in `App.tsx` verwendet).
- `src/components/Footer.tsx`: App-Footer, in `App.tsx` eingebunden.
- `src/components/Sidebar.tsx`: Generisches Slide-out-Menü (Portal-basiert, animiert).
- `src/components/BookingApp.tsx`: Haupt-UI der öffentlichen Seite – Lehrerfilter, Slotliste, Buchungsanfrage-Flow.
- `src/components/BookingForm.tsx`: Formular für Buchungsanfragen; validiert je nach Besuchertyp (`parent` | `company`).
- `src/components/TeacherCombobox.tsx`: Durchsuchbarer Lehrer-Selektor.
- `src/components/TeacherList.tsx`: Karten-basierte Lehrerliste.
- `src/components/SlotList.tsx`: Slot-Anzeige.
- `src/components/TeacherRequestsTableSandbox.tsx`: Komplexe Tabelle für Lehrkräfte zum Verwalten von Buchungsanfragen (Annehmen/Ablehnen mit Zeitauswahl).
- `src/components/Breadcrumbs.tsx`: Breadcrumb-Navigation.
- `src/components/ViewModeToggle.tsx`: Admin/Teacher-Ansichtsumschalter für Dual-Rollen-Nutzer (persistiert in `localStorage` als `active_view`).
- `src/components/Dropdown.tsx`: Generische Dropdown-Komponente.
- `src/components/ProtectedRoute.tsx`: Gate für geschützte Bereiche; leitet nicht authentifizierte Nutzer um.
- `src/pages/MaintenancePage.tsx`: Wartungsseite; kann per Env-Flag aktiviert werden.
- `src/hooks/useBooking.ts`: State-Management für Slots, Auswahl und Buchungslogik; liefert `message` für UI-Hinweise.
- `src/services/api.ts`: Zentraler API-Client; setzt Auth-Header, robustes JSON-Parsen, 401 → `auth:logout`-Event.
- `src/types/index.ts`: TypeScript-Interfaces (`Teacher`, `TimeSlot`, `BookingFormData`, `BookingRequest`, `Settings`, `FeedbackItem`, `UserAccount`).
- `src/contexts/AuthContext.tsx`: Auth-Provider mit JWT-Verify und Rollen.
- `src/contexts/AuthContextBase.ts`: Auth-Context-Typen.
- `src/contexts/useAuth.ts`: `useAuth()`-Hook.
- `src/utils/teacherDisplayName.ts`: Anzeigename-Formatierung für Lehrkräfte.
- `src/utils/icalExport.ts`: iCal-Export-Utility.

### Backend
- `backend/index.js`: Express-App, öffentliche/Admin/Teacher-Routen.
- `backend/routes/auth.js`: Login/Logout/Verify, JWT-Issuance (mit `teacherId` bei Lehrern).
- `backend/routes/teacher.js`: Geschützte Lehrer-Endpoints (Bookings, Slots, Requests, Cancel, Accept, Decline, Password, Room, Feedback). Enthält Auto-Assignment-Timer für überfällige Anfragen (5-Min-Intervall, 24h-Schwelle).
- `backend/middleware/auth.js`: JWT-Validierung, Rollen-Checks (`requireAuth`, `requireAdmin`, `requireTeacher`).
- `backend/config/supabase.js`: Supabase-Client-Konfiguration.
- `backend/config/email.js`: E-Mail-Konfiguration (Ethereal für Dev, SMTP für Produktion); `sendMail`, `isEmailConfigured`.
- `backend/services/slotsService.js`: Slot-Listing, Reserve-Booking, Token-Verify, Admin-Bookings, Cancel.
- `backend/services/teachersService.js`: Lehrer-Listing.
- `backend/utils/mappers.js`: DB-Row-Mapper (`mapSlotRow`, `mapBookingRowWithTeacher`, `mapBookingRequestRow`).

Hinweis (Wartungsmodus): Das Frontend kann per Env `VITE_MAINTENANCE_MODE=true|1|yes` in den Wartungsmodus geschaltet werden. Der Login bleibt dabei erreichbar.

## Buchungsanfrage-System (Booking Requests)

Der **primäre Buchungsflow** ist anfrage-basiert (nicht direkte Slot-Buchung):
1. Elternteil/Unternehmen stellt eine Buchungsanfrage (`POST /api/booking-requests`) mit gewünschter Uhrzeit.
2. Besucher erhält eine Verifizierungs-E-Mail; klickt den Verifizierungslink (`GET /api/bookings/verify/:token`).
3. Lehrkraft sieht die verifizierte Anfrage in `/teacher/requests` und kann:
   - **Annehmen** (`PUT /api/teacher/requests/:id/accept`) – mit finaler Uhrzeit und optionaler Nachricht → Bestätigungs-E-Mail an Besucher.
   - **Ablehnen** (`PUT /api/teacher/requests/:id/decline`).
4. Überfällige verifizierte Anfragen (>24h) werden automatisch einem Zeitslot zugewiesen (Backend-Timer).

Zusätzlich existiert noch ein Legacy-Direktbuchungs-Endpoint (`POST /api/bookings`), der im normalen UI-Flow nicht mehr primär verwendet wird.

Hinweis (Privacy): `GET /api/slots` liefert **synthetische Slots** mit `booked: false` – echte Buchungsdaten werden nicht öffentlich exponiert.

## Lehrer-Systemtypen
Lehrkräfte haben ein `system`-Feld (`dual` | `vollzeit`), das Zeitfenster und Slot-Granularität bestimmt:
- `dual`: 16:00–18:00
- `vollzeit`: 17:00–19:00
- Slots: 30-Minuten-Fenster mit 15-Minuten-Sub-Slots.

## Routing
- Öffentlich: `/` (BookingApp), `/login`, `/impressum`, `/datenschutz`, `/verify` (E-Mail-Bestätigung)
- Geschützt – Teacher: `/teacher` (mit `TeacherLayout` und Outlet)
  - `/teacher` (index) → `TeacherHome` (Dashboard mit Timeline, Statistiken)
  - `/teacher/requests` → `TeacherRequests` (Buchungsanfragen verwalten)
  - `/teacher/bookings` → `TeacherBookings`
  - `/teacher/password` → `TeacherPassword`
  - `/teacher/feedback` → `TeacherFeedback`
  - `/teacher/*` → Redirect auf `/teacher`
- Geschützt – Admin: `/admin`, `/admin/teachers`, `/admin/slots`, `/admin/events`, `/admin/users`, `/admin/feedback`
- Catch-All: `*` → Redirect auf `/`

Hinweis: `TeacherRoom.tsx` existiert als Page-Datei, ist aber aktuell **nicht als Route in `App.tsx` eingebunden**.

## Authentifizierung
- JWT (HS256) im `localStorage` als `auth_token`.
- Bei 401 sendet der API-Client ein globales `auth:logout` Event → Logout-Flow in der App (siehe `src/services/api.ts`).
- `GET /api/auth/verify` liefert Auth-Zustand inkl. `role` und ggf. `teacherId`.
- Admin-Nutzer mit `teacherId` können per `ViewModeToggle` zwischen Admin- und Teacher-Ansicht wechseln (`active_view` in localStorage).
- Rollenwechsel werden erst nach erneutem Login wirksam (Rolle steckt im JWT).

## API-Verträge (vereinheitlichte Antworten)

### Öffentlich
- `GET /api/teachers` → `{ teachers: Teacher[] }`
- `GET /api/slots?teacherId=...&eventId=...` → `{ slots: Slot[] }` (synthetische Privacy-Slots; optional `eventId`, sonst aktuell veröffentlichtes Event)
- `POST /api/bookings` → `{ success, updatedSlot?, message? }` (Legacy-Direktbuchung; nur bei aktivem Event)
- `POST /api/booking-requests` → `{ success, message? }` (Primärer Anfrage-Flow; Body: `{ teacherId, requestedTime, visitorType, ... }`)
- `GET /api/bookings/verify/:token` → E-Mail-Verifizierung einer Buchungsanfrage
- `GET /api/events/active` → `{ event: Event | null }`
- `GET /api/events/upcoming` → `{ events: Event[] }`
- `GET /api/health` → `{ status: 'ok', ... }`
- `GET /api/dev/email/last` → Letzte Dev-E-Mail (nur Ethereal-Transport)

### Admin
- `GET /api/admin/bookings` → `{ bookings: Booking[] }`
- `DELETE /api/admin/bookings/:slotId` → `{ success }`
- `GET /api/admin/feedback` → `{ feedback: { id, message, created_at }[] }`
- `DELETE /api/admin/feedback/:id` → `{ success }`
- `GET /api/admin/users` → `{ users: UserAccount[] }`
- `PATCH /api/admin/users/:id` → `{ success, user }` (Role-Update; erlaubt: `admin` | `teacher`)
- `GET /api/admin/slots` → `{ slots: Slot[] }` (optional `teacherId`, `eventId`, `booked`, `limit`)
- `POST /api/admin/slots` | `PUT /api/admin/slots/:id` | `DELETE /api/admin/slots/:id`
- `GET /api/admin/teachers` → `{ teachers: Teacher[] }`
- `POST /api/admin/teachers` | `PUT /api/admin/teachers/:id` | `DELETE /api/admin/teachers/:id`
- `PUT /api/admin/teachers/:id/reset-login` → Login-Credentials einer Lehrkraft zurücksetzen
- `POST /api/admin/teachers/:id/generate-slots` → Slots pro Lehrkraft generieren
- `GET /api/admin/settings` → Einstellungen (nutzt nur `requireAuth`, nicht `requireAdmin`)
- `PUT /api/admin/settings` → Einstellungen speichern (`requireAdmin`)
- `GET/POST/PUT/DELETE /api/admin/events` → CRUD für Events
- `GET /api/admin/events/:id/stats` → Slot-Statistik
- `POST /api/admin/events/:id/generate-slots` → Slots für ein Event generieren

### Teacher (alle `requireAuth` + `requireTeacher`)
- `GET /api/teacher/bookings` → `{ bookings: Booking[] }`
- `GET /api/teacher/slots` → `{ slots: Slot[] }`
- `GET /api/teacher/requests` → `{ requests: BookingRequest[] }`
- `PUT /api/teacher/requests/:id/accept` → Anfrage annehmen (Body: `{ time?, teacherMessage? }`)
- `PUT /api/teacher/requests/:id/decline` → Anfrage ablehnen
- `DELETE /api/teacher/bookings/:slotId` → Buchung stornieren
- `PUT /api/teacher/bookings/:slotId/accept` → Buchung bestätigen
- `GET /api/teacher/info` → `{ teacher: ... }`
- `PUT /api/teacher/room` → `{ success, teacher }` (Body: `{ room }`)
- `PUT /api/teacher/password` → `{ success }` (Body: `{ currentPassword, newPassword }`)
- `POST /api/teacher/feedback` → `{ success, feedback }` (Body: `{ message }`)

## E-Mail-System
- E-Mails werden via Nodemailer versendet.
- Dev: `MAIL_TRANSPORT=ethereal` → Test-E-Mails mit Preview-Link (`GET /api/dev/email/last`).
- Produktion: SMTP-Konfiguration über `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`.
- Verwendung: Verifizierungs-E-Mails nach Buchungsanfrage, Bestätigungs-E-Mails nach Annahme durch Lehrkraft.
- Konfiguration siehe `backend/config/email.js`.

## UX-Patterns
- `GlobalTopHeader`: Haupt-App-Header in `App.tsx` – Navigation, Sidebar, Bereichs-Labels.
- Breadcrumbs: „BKSB Buchungssystem / Elternsprechtag".
- Hinweise: Anzeigen über `useBooking().message` im UI. Kein globaler Toast-Provider implementiert.
- Fehlerbehandlung: `AppErrorBoundary` fängt Render-Fehler in den Routen ab; komponentenlokale Fehlerbehandlung bleibt sinnvoll (z.B. für API-Fehlerzustände).

## Häufige Aufgaben für KI-Agents
- Buchungsflow anpassen:
  - Primärer Flow: Buchungsanfragen (`api.createBookingRequest`) → E-Mail-Verifizierung → Lehrkraft akzeptiert/lehnt ab.
  - Änderungen in `useBooking.ts` (Logik), `BookingForm.tsx` (UI/Validierung), `BookingApp.tsx` (Flow).
  - Event-Logik beachten: Buchungen/Slots sind an den aktiven Elternsprechtag gekoppelt.
- Teacher-Anfragen:
  - `TeacherRequests.tsx` + `TeacherRequestsTableSandbox.tsx`: Anfragen-Verwaltung (Accept/Decline mit Zeitauswahl).
  - API: `api.teacher.getRequests()`, `api.teacher.acceptRequest(id, { time, teacherMessage })`, `api.teacher.declineRequest(id)`.
- Admin-Slots:
  - CRUD in `src/pages/AdminSlots.tsx`; nutze `api.admin.*` Methoden.
- Admin-Events:
  - `src/pages/AdminEvents.tsx`: Events verwalten, Slots generieren, Status (draft/published/closed) setzen.
- Admin-Lehrkräfte:
  - `src/pages/AdminTeachers.tsx`: CRUD, Login-Reset (`api.admin.resetTeacherLogin`), Slot-Generierung pro Lehrkraft (`api.admin.generateTeacherSlots`).
- Admin-Nutzer/Feedback:
  - `src/pages/AdminUsers.tsx`: Nutzerverwaltung, Rollenzuweisung.
  - `src/pages/AdminFeedback.tsx`: Feedback einsehen/löschen.
- Teacher-Bereich (Sidebar-Layout):
  - Layout/Navigation: `src/pages/teacher/TeacherLayout.tsx`
  - Dashboard: `src/pages/teacher/TeacherHome.tsx` (Timeline, Statistiken)
  - Anfragen: `src/pages/teacher/TeacherRequests.tsx` (Buchungsanfragen verwalten)
  - Buchungen: `src/pages/teacher/TeacherBookings.tsx` (Storno via `api.teacher.cancelBooking`, Bestätigen via `api.teacher.acceptBooking`)
  - Passwort: `src/pages/teacher/TeacherPassword.tsx` (via `api.teacher.changePassword`)
  - Feedback: `src/pages/teacher/TeacherFeedback.tsx` (anonym via `api.teacher.submitFeedback`)

## Commit-Hygiene (Konventionen)
- Verwende konventionelle Nachrichten:
  - `feat(scope): ...`
  - `fix(scope): ...`
  - `ui(scope): ...`
  - `style(scope): ...`
- Beispiele:
  - `feat(requests): add booking request accept/decline flow`
  - `fix(booking): improve error mapping for API`
  - `ui(admin,teacher): surface success/error states in UI`

## Schnellbefehle
```bash
# Frontend starten
cd /workspaces/elternsprechtagNavi_01_12_2025
npm run dev

# Backend starten
cd /workspaces/elternsprechtagNavi_01_12_2025/backend
npm run dev

# Git
cd /workspaces/elternsprechtagNavi_01_12_2025
git status
git add -A && git commit -m "feat: …"
git push origin main
```

## Sicherheit & Qualität
- Verändere nur relevante Dateien, halte Änderungen minimal und konsistent.
- Prüfe API-Verträge; normalisiere Responses zu Arrays, um UI-Fehler (map/filter) zu vermeiden.
- Bei Auth-Änderungen: Token-Handling (`localStorage`, `verify`), `auth:logout`-Events testen.
- `GET /api/admin/settings` nutzt nur `requireAuth` (nicht `requireAdmin`) – bei Bedarf absichern.

## Kontaktpunkte für Erweiterung
- CI (optional): Lint/Typecheck/Build Workflows.
- Design Tokens & Dark Mode (optional).
- Globaler Toast-Provider (nicht implementiert; UI-Hinweise laufen über `useBooking().message`).
- `/teacher/room`-Route: `TeacherRoom.tsx` existiert als Page, ist aber nicht in `App.tsx` eingebunden.

---
Bei Unsicherheit: Suche zuerst in `src/services/api.ts`, `src/components/BookingApp.tsx`, `src/hooks/useBooking.ts`, `src/types/index.ts` und den jeweiligen Seiten (`src/pages/Admin*.tsx`, `src/pages/teacher/*`). Diese spiegeln die Kernlogik der App.
