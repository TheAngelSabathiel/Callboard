# Callboard · Stage Management App

A web app for theater stage managers: company directory, tasks, rehearsal calendar with called lists, availability checker, collaborative SM reports, script with blocking and cues, scene breakdown, props, line notes, and print / Word / Excel / Google exports.

Built with Next.js (App Router) and Supabase, deployed on Vercel, and works on phones.

**Current build: Phase 9 · New Supabase API keys (publishable + secret)**

> **Built to update the book *during* rehearsal**, so you don't spend another hour after rehearsal cleaning up notes, props and blocking. Open **Rehearsal Mode** when the room starts. Every note, prop, line note and attendance tap lands in the right place as it happens, and the day's report is already written when you call "thank you, that's rehearsal."

Contents
1. [Setup (one time)](#1-setup-one-time)
2. [User guide](#2-user-guide)
3. [Troubleshooting](#3-troubleshooting)
4. [Development phases](#4-development-phases)
5. [Project structure & file manifest](#5-project-structure)

---

## 1. Setup (one time)

### 1.1 Supabase (database + accounts)
1. Create a free project at **supabase.com**. Pick the Singapore region if you're in the Philippines.
2. Open **SQL Editor → New query**, paste the whole of **`supabase/callboard_schema.sql`**, and click **Run**.
   - This one file is the **initial SQL**: every migration (0001 to 0007) in order. For a brand-new project, run only this file, once.
   - Upgrading a project that already ran 0001 to 0006? Run just `supabase/migrations/0007_activity.sql`.
3. **Authentication → URL Configuration**
   - Site URL: your Vercel address, e.g. `https://callboard-yourname.vercel.app`
   - Redirect URLs: add `https://YOUR-DOMAIN/**` and `http://localhost:3000/**`
4. **Authentication → Providers → Email**: keep it on. While testing you can turn off "Confirm email" so new accounts work right away.
5. **Authentication → Email Templates** (needed for **✉ Send invite**; recommended for the others). Set each link to the app's `/auth/confirm` handler:

| Template | Link (replace the `href` in the template) |
|---|---|
| Invite user | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/auth/reset` |
| Confirm signup | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard` |
| Reset password | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/reset` |

### 1.2 API keys (publishable + secret)
Supabase is retiring the legacy `anon` and `service_role` keys (early 2027). **This app uses only the new keys.** There is no anon or service_role key anywhere in the code.

1. Supabase → **Project Settings → API Keys → "Publishable and secret API keys"** tab. If you see **Create new API keys**, click it. This is safe: existing keys keep working.
2. Copy:
   - **Publishable key**, starts with `sb_publishable_`. Used by the browser and the server *as the signed-in user*, so Row Level Security protects all data.
   - **Secret key** (`default`), starts with `sb_secret_`. Click to reveal. **Server only.**
3. When everything works, you can go back to the **Legacy API keys** tab and **disable** the legacy keys. The app doesn't need them.

| Key | Env variable | Where it runs | Used for |
|---|---|---|---|
| Publishable `sb_publishable_…` | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser + server | everything users do (RLS enforced) |
| Secret `sb_secret_…` | `SUPABASE_SECRET_KEY` | server only (`lib/supabase/admin.ts`, `server-only` guarded) | **✉ Send invite** emails (Company & Cast) and the database check at `/api/health`. Optional: without it, those two features switch off and everything else works. |

Rules the code enforces:
- The app **refuses to start** (clear message instead of a crash) if the publishable key is missing, or isn't an `sb_publishable_` key, or if a secret key was pasted into it.
- The admin client only accepts `sb_secret_` keys, and every admin action first checks that the signed-in user is the Head SM.
- **Never** put the secret key in a variable starting with `NEXT_PUBLIC_`, because Next.js would ship it to every browser. `/api/health` warns if that happens.

### 1.3 Vercel (hosting)
1. Put this folder in a GitHub repository (GitHub Desktop is easiest: *Add local repository → Publish*).
2. On **vercel.com → Add New → Project**, import the repository. Framework: Next.js (auto-detected).
3. Under **Environment Variables**, add these for *Production* and *Preview*:

| Name | Value | Sensitive? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL (`https://xxxx.supabase.co`) | no |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` | no (public by design) |
| `SUPABASE_SECRET_KEY` | `sb_secret_…` | **yes, tick "Sensitive"** |
| `NEXT_PUBLIC_SITE_URL` | your Vercel URL, no trailing slash | no |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | optional, see 1.5 | no |

4. Click **Deploy**. Then put the final URL into Supabase (1.1.3).
5. Open **`https://YOUR-DOMAIN/api/health`**. Every check should say `ok` (`database: ok (schema found)` confirms the SQL ran). Values are never shown, only their status.
6. `NEXT_PUBLIC_` values are baked in at build time: after changing one, **Redeploy**.

If you use the **Supabase ↔ Vercel integration**, it may add its own variables. Make sure the three names above exist with the *new* keys, and remove any `…ANON_KEY` / `…SERVICE_ROLE_KEY` variables.

### 1.4 Run on your computer (optional)
```bash
cp .env.example .env.local    # fill in the values above
npm install
npm run dev                   # http://localhost:3000
```

### 1.5 Google Docs / Sheets export (optional)
1. **console.cloud.google.com** → create a project → **APIs & Services → Library** → enable **Google Drive API**.
2. **OAuth consent screen** → External → add the scope `.../auth/drive.file` → add your Google account(s) as test users (or publish the app).
3. **Credentials → Create credentials → OAuth client ID → Web application**. Under Authorized JavaScript origins, add `http://localhost:3000` and your Vercel URL.
4. Put the client ID in `NEXT_PUBLIC_GOOGLE_CLIENT_ID` on Vercel and redeploy. "Open in Google Docs / Sheets" then appears in every Export menu.

The app only gets access to files it creates in your Drive (`drive.file`). Nothing else in your Drive is visible to it.

---

## 2. User guide

### 2.0 Getting around
- **? buttons** next to every page title explain that page, with tips and keyboard shortcuts.
- **🔔 Bell** (top of the side menu; top bar on phones) shows the team activity feed: who added, edited or deleted what, with links. The badge counts changes you haven't seen. *Enable desktop alerts* adds a system notification when the tab is in the background.
- **Pop-up notifications**:
  - Your own actions confirm with a short message: *Prop added*, *Cue saved*, *Line note deleted*.
  - Adds and deletes come with **Undo**.
  - When a teammate changes something, you get a pop-up with **View**.
  - Errors stay on screen longer so you can read them.
- **＋ Note** (floating button, bottom right): log a note, prop, line note or task from any page without leaving it.
- **On phones**, the bottom bar has the pages used in the room: Live, Script, Props, Calendar, Reports. Everything else is under ☰.

### 2.1 Rehearsal Mode (use this in the room)
Open it from the **Overview** banner, the menu (**● Rehearsal Mode**), or a calendar day's **● Rehearsal Mode** button. Keep it open on a laptop or phone for the whole rehearsal.

| Part | What it does |
|---|---|
| **Log it now** | One box, four kinds. **Note**: pick a department chip (General, Director, Script, Props, Set, Costume, Hair & Makeup, Lights, Sound, Video, Movement, Production, Venue), type, press **Enter**. It's added to today's report as `• [7:42 PM] …`. *⚑ Follow up* flags the section for that department. **+ Prop**: goes into the Props Tracker as *Needed* and is also noted in the report's Props section. **Line note**: character chip, issue chip, page, what was said. **Task**: assign on the spot. The box clears and keeps the cursor, so you can keep typing. |
| **Now / Next** | The current agenda block from the calendar, who's called, and minutes left. |
| **Rehearsal clock** | **Start**, **5′ / 10′ / 15′ break** (countdown turns red when time is up), **Resume**, **End**. Each tap stamps the time into the report's Times. |
| **Attendance** | Everyone called today. Tap: Present → Late (time stamped) → Absent → Excused. |
| **Today's report so far** | What's been logged, by department. *Edit full report* opens the shared editor. |

The day's report is created automatically (linked to the calendar item) the first time you save something. Other SMs can log at the same time from their own phones. Everything merges into the same report, and the bell shows who added what.

**Shortcuts:** `N` jumps to the note box · `Enter` saves · `Shift+Enter` new line.

### 2.1b Blocking at speed (Script page)
- Tap a line. The panel stays open and keeps the cursor in the box.
- **Character buttons** (dark) and **shorthand buttons** (X, ENT, DSL…) type for you: tap *Bitoy* → *X* → *DSL* → Enter.
- Tick **Enter = save + next line** to block straight down the page without touching the mouse. **Next line ↓** skips a line. `Alt+↑/↓` moves lines while typing. `Esc` closes the panel.
- **Note tab → + Prop** sends the item to the Props Tracker with the page number and the speaking character, and marks the line.
- **Cue tab**: the next cue number is filled in. Choose a standby a few lines earlier.


### 2.1c Accounts and roles
- Anyone can **sign up** with an email and password. **Forgot password** sends a reset link.
- Every production has its own company list. Each person has an **app access** role:

| Role | What they can do |
|---|---|
| **Head SM** | Everything: company list and access roles, assigning tasks to anyone, production settings, archive/delete |
| **SM / ASM** | Edit the calendar, availability, reports, script, cues, breakdown, props and line notes; import files; log their own tasks |
| Director, Production Manager, Designer, Crew, Actor, Viewer | Read everything; update their **own** availability; update status on tasks assigned to them |

- Rules are enforced by the database (Row Level Security), not just hidden buttons.
- A production always keeps at least one Head SM with an account. To hand over, promote someone else to Head SM first.
- **To give someone access:** add them in *Company & Cast* with their email, then tap **✉ Send invite**. They get an email, set a password and land on the dashboard. (Or send them your site's `/signup` link: signing up with the same email links them automatically.)
- Anyone except a Head SM can leave a production from *Settings → Leave production*.

### 2.2 Productions: new, next, finished
- **Dashboard → New production**
  - **Blank production**: you become its Head SM.
  - **Copy from: (an earlier show)**: starts the next show with your team already in place. Choose what comes over:
    - Company: *Only me*, *Production team* (SM team, director, PM, designers, crew) or *Everyone including actors* (for a re-run or remount)
    - Characters and casting, Scene breakdown, Props list (statuses reset to *Needed*), Current script + blocking, Cues
    - The calendar, availability, reports, tasks and line notes always start empty
- **Settings**: title, company line, producer, director, venues, show dates, script version, first rehearsal and opening dates (these drive the countdown) and accent color. These details print on every report header.
- **Archive** a finished show to hide it from the dashboard and keep everything (*Show archived* brings it back). **Delete** removes it permanently.

### 2.3 Import your existing paperwork (continue where you left off)
Open the production → **Import files** (SM team only). Imports only **add** to the production; nothing is deleted.

**1 · SM paperwork workbook (.xlsx)**: e.g. `PORTRAIT_SM_Paperworks.xlsx`. Each sheet is detected automatically, and you can change the type before importing:

| Sheet | Becomes |
|---|---|
| *Directory* (Role/Position, Name, Alternates, Contact, Email; "Production Staff" / "Actors" sections) | Company list with departments and access roles; characters with actor and alternate. A person listed as both staff and actor becomes one person |
| *Tabular Calendar* (Date, Venue, Time, Rehearsal Agenda, Called, Notes) | Calendar days with time blocks. "Called" names are matched to characters ("Tony" → Tony Javier, "Dona Irene" → Cora/ Dona Irene); "All actors are called" becomes all called; anything unmatched is kept in the block notes |
| *Prod & Actors Schedule* (A / UN / TBD grid by month) | Availability. Set the year of the first month; later months roll over automatically (e.g. into January). Free-text cells become TBD with the text as a note; the NOTES column goes to the person's notes |
| *Sequence Breakdown* / *Actors Breakdown* | Scene breakdown rows grouped by ACT. Only one breakdown sheet is selected by default (the "upd" one); switch it if you prefer another |
| *CALENDAR* (month grid) | Skipped. The tabular calendar holds the same information |

Import order is always directory → availability → calendar → breakdown, so "Called" names can be matched to characters. Tick *Skip dates that already have calendar items* to avoid duplicates if you import twice.

**2 · Meeting / SM reports (.docx)**: e.g. `Portrait_Meeting_Report.docx`. The importer reads *Present, Start/End Time, Agenda, General Meeting Notes, Schedules Given/Received, Next Rehearsal Date, Prepared by*. Pick the meeting date for each file. If the notes contain a schedule ("DEC 2- ACT 2 … - 6:00 PM-7:30PM: UNIT 30, 31…"), tick the box to turn it into calendar days too.

**3 · Paste a schedule**: paste a schedule from a group chat or document (date line, optional called line, time lines) and create calendar days.

**Scripts** are imported from *Script & Blocking → Import*. **Any other table** (props list, cue sheet, extra directory rows) can be copied from Excel or Google Sheets and added with **Paste from Excel / Sheets** on that page. You map each column, and you can skip a header row.

### 2.4 Company & Cast
- **Directory**: grouped by department. The Head SM edits inline (position, name, access, email, phone, department). The badges show *Linked* (has an account), *Invite pending* (email added, no account yet) or *Contact only*.
- **Paste from sheet**: copy rows of Position · Name · Email · Phone.
- **Cast**: one row per character with an **actor** and an **alternate**. Add many characters at once (one per line). Calendar "called" lists, availability and reports all use these links.
- Export: directory and cast list (Print / Word / Excel / Google).

### 2.5 Tasks
- The Head SM clicks **+ Assign task**: title, details, assignee, due date, priority, department.
- The board has four columns (To do / In progress / Blocked / Done). Assignees change the status on their own cards. Overdue dates turn red.
- Everyone sees **My open tasks** across all productions on the dashboard.

### 2.6 Calendar and agenda
- **Month** view: colored by type (rehearsal, tech, dress, show, meeting, fitting, shoot, load-in, strike). The red number on a day shows how many cast are unavailable. Tap a day to see it in the side panel; double-tap to add.
- **Agenda** view: the tabular calendar with each time block, who's called and any conflicts.
- **New**: date, type, title, venue, call/start/end times, and optionally *repeat weekly until* a date.
- Open a day to build the **agenda**:
  - Add blocks (*+ Block*, *+ Call time*, *+ Break*, *+ Company call*) with times, agenda, and units/pages
  - Tap characters to call them (the **alt** button calls the alternate), or tick *All actors called*
  - Reorder blocks with ↑ ↓
  - **Conflicts** turn the block red (called but UN, or outside a partial-availability window). **Unconfirmed** lists people who are TBD or haven't answered
- Each day has buttons for **SM report** (opens or creates that day's report), **Call sheet** and **Sign-in sheet**, plus **Duplicate** (copies the day and its agenda to another date).

### 2.7 Availability
- The grid shows people × dates. Choose Cast / Production / All, the start date and the number of days.
- **Tap: cycle** goes A → UN → TBD → PART → blank. **Tap: details** (or right-click) adds a note or a partial time window ("free from 7 PM").
- **Bulk fill**: pick people, a date range and weekdays, then set a status (e.g. everyone A on weekdays).
- Actors can update **their own** row from their phone.
- **Availability checker** (below the grid): pick the characters for a scene to see who's available, unavailable or unknown for a date and time, and the **best dates** in view ranked by how many can come.

### 2.8 Reports (rehearsal, tech, performance, meeting)
- Create one from **Reports → New** or from a calendar day's **SM report** button. Reports are numbered per type (Rehearsal Report #12).
- When linked to a calendar day, the time breakdown and attendance are filled in for you.
- The **SM team writes together live**:
  - Each department section autosaves
  - Avatars show who has the report open, and *"… typing"* shows who is in which section
  - If someone changes a section you're typing in, you get a prompt instead of having your text overwritten
- **⚑** flags a section for department follow-up. Flagged items show on the production Overview.
- **Attendance**: present, late (with arrival time), absent, excused. *Add all cast* / *Add production team*.
- **Performance** reports have running times (house open, act up/down, curtain, house count, hold reason) with act lengths, intermission and total worked out for you.
- **Mark final** when done. **Export** to print/PDF, Word or Google Docs, with "Prepared by / Noted by" signature lines.

### 2.9 Script & blocking
- **Import**: upload a .docx or .txt (or paste). Use page markers in the file ("Page 12", "pg. 12" or page breaks), or set *lines per page*. Headings are detected (ACT / SCENE / UNIT / Akto / Yugto / Eksena / Tagpo), as are speakers ("CANDIDO: …" or a name on its own line) and stage directions in ( ) or [ ]. Check the preview, then import. Add characters first for better speaker detection.
- **Navigate**: outline (acts/scenes/units), jump to page, search with ‹ › and **Highlight character** (also lists the pages they speak on). A− A+ changes the text size; ↑ ↓ moves line by line.
- **Mark a line** (tap it):
  - *Blocking*: shorthand buttons X, ENT, EXT, DSL, USR, C… Press Enter to save.
  - *Note*, *Log line change*, and highlight colors
  - *Cue*: department, number (auto-next), time/count, description, and a standby mark N lines before. It shows in the left margin as **LX 12** with *stby* marks.
  - *Edit*: fix the text, speaker, type or page; insert a line after; delete a line
- Show or hide blocking, notes, cues and cue departments.
- **Export → Prompt book**: script, cues and blocking/notes side by side, for print, Word or Excel.
- **Import new version** keeps old versions selectable (★ = current).

### 2.10 Cue sheet
- Every cue in running order, grouped by act. Filter by department (LX, SQ, MX, VQ, FLY, SPOT, DECK, FX, SM).
- Edit inline, add or reorder rows, paste from a spreadsheet, mark cues *Cut*, and **Renumber** a department 1…n.
- Export a master cue sheet or a single department's cue sheet for each operator.

### 2.11 Scene breakdown
- **Breakdown**: Act, Unit, French scene, Page, Setting, Characters, Entrance, Exit, Props, Set, Sound, Lights, Video, Costume, Movement, Remarks. Click a cell to edit. Use ＋ to insert a row below and ↑ ↓ to reorder.
- **Scene chart**: characters × scenes, built from the Characters column (use the character names from Cast).
- **From script**: who speaks in each scene or page, taken from the imported script.

### 2.12 Props tracker
- **Quick add** at the top: type the prop, optionally *used in* and a *handled by* character chip, then press Enter.
- On phones, props show as cards. Tap the status chip to move it along (Needed → Sourcing → Rehearsal prop → Show-ready → Repair → Cut). Tap the card to edit details.
- Prop, quantity, type, where it's used, who handles it, preset location, source, and status (Needed → Sourcing → Rehearsal prop → Show-ready, Repair, Cut). Filter by status and export the list for the props team.

### 2.13 Line notes
- **Quick entry** at the top: character chip → issue chip → page → what was said → Enter. Built for logging during a run without looking away for long.
- During runs, log the character, page, line as written, the issue (dropped, paraphrased, wrong word…) and what was said. Filter by date and character.
- **Send to actors** opens your email app with each actor's notes filled in (uses the email in Company & Cast). Tick *Given* when delivered. Export grouped by character.

### 2.14 Printing and exports
- Every page has **Export ▾** with these options:
  - **Print / Save as PDF**: opens a clean A4 page. Use your browser's Print and choose "Save as PDF" or a printer. Landscape documents (calendar, availability, cue sheet, breakdown) set landscape automatically.
  - **Word (.docx)** and **Excel (.xlsx)**: formatted with the production header, page numbers and repeating table headers.
  - **Open in Google Docs / Sheets**: when set up (1.5).
- Printable documents available:
  - SM reports and meeting reports
  - Daily call sheet
  - Sign-in sheet
  - Rehearsal calendar
  - Availability grid
  - Directory and cast list
  - Task list
  - Prompt book
  - Cue sheets
  - Sequence breakdown
  - Scene chart
  - Props list
  - Line notes

### 2.15 On your phone
- Everything works in the mobile browser. The menu is the ☰ button at the top.
- To install it like an app: in Safari, *Share → Add to Home Screen*; in Chrome, *⋮ → Add to Home screen*.
- In the script, the line panel slides up from the bottom. Wide tables scroll sideways.

### 2.16 A typical production, start to finish
1. **New production** (blank, or *Copy from* your last show), then fill in *Settings*.
2. **Import files**: your SM paperwork workbook and past meeting reports.
3. *Company & Cast*: check the access roles, add emails, and send the sign-up link.
4. Ask the company to fill in *Availability*.
5. Build the *Calendar* and fix any red conflicts. Print or send the **call sheet**.
6. Import the *Script*, then block and add cues during rehearsals. Keep the *Breakdown* and *Props* up to date.
7. During every rehearsal, run **Rehearsal Mode**: notes, props, line notes, attendance and times go in live, and blocking goes in the Script page. After rehearsal, open the report, tidy up, **Mark final** and export. That takes minutes, not an hour.
8. During tech and shows, use the cue sheets, sign-in sheets, performance reports with running times, and line notes.
9. After closing: **Archive** the show. Next time, *Copy from* it.

---

## 3. Troubleshooting

| Problem | Fix |
|---|---|
| "Production unavailable" | You're not in that production's company list (or it was deleted). Ask the Head SM to add your email. |
| Someone added by email doesn't see the show | They must sign up with **exactly** that email. Check for typos in *Company & Cast*. |
| Sign-up email link goes to localhost | Set *Site URL* and *Redirect URLs* in Supabase (1.1.3) and `NEXT_PUBLIC_SITE_URL` on Vercel. |
| Page says "Callboard is not configured yet" | A Supabase variable is missing or holds the wrong kind of key. Fix it in Vercel (1.3) and **Redeploy**. |
| "Legacy API keys are disabled" / 401 errors | You're still using an old anon key somewhere. Use the `sb_publishable_` key in `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and redeploy. |
| No **✉ Send invite** button | `SUPABASE_SECRET_KEY` isn't set (or isn't `sb_secret_…`). Check `/api/health`. Only the Head SM sees the button, and only for people with an email and no account yet. |
| Invite link opens the login page with an error | Update the **Invite user** email template (1.1.5). Links also expire, so send the invite again. |
| "A production needs at least one Head SM…" | Promote another person to Head SM before changing or removing the current one. |
| Imported "Called" names went to block notes | Those names aren't characters yet. Add them in *Cast* (with an actor), then pick them in the agenda. |
| Availability dates are a year off | Re-import with the correct *Year of the first month*. Imports overwrite matching person/date cells. |
| Script pages are wrong | Re-import with page markers in the file, or set *Fallback lines/page*. You can also fix a line's page under *Edit*. |
| Google export does nothing | Check `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, that the Drive API is enabled, that your URL is an Authorized JavaScript origin, and that pop-ups are allowed. |
| No pop-ups or bell updates from teammates | Run `0007_activity.sql` (included in `callboard_schema.sql`). Check *Database → Replication* has `activity` in `supabase_realtime`. Desktop alerts need *Enable desktop alerts* in the bell and browser permission. |
| Today's notes went to the wrong date | Rehearsal Mode uses the date at the top of the page. Change it before logging, or move the text in the report editor. |
| Changes don't appear live for others | In Supabase, *Database → Replication*: make sure the `supabase_realtime` publication includes the tables (the schema file adds them). |

---

## 4. Development phases

### ✅ Phase 1 · Foundation
- Email/password accounts, password reset, profile page
- Productions: create (creator = Head SM), edit details, archive, delete
- Company directory grouped by department, app-access roles, invite-by-email linking, paste rows from Excel/Sheets
- Cast list: characters with actor and alternate
- Tasks: Head SM assigns with due date, priority, department; kanban by status; assignees update their own status; "My open tasks" across productions on the dashboard
- Realtime sync on tasks

### ✅ Phase 2 · Calendar, agenda, availability
- Calendar with month view (color-coded by type: rehearsal, tech, dress, show, meeting, fitting, shoot, load-in, strike) and agenda list view, mirroring the *Tabular Calendar* sheet
- Day items with call/start/end time, venue, company notes and reminders; weekly repeat on create; duplicate to another date with its agenda
- Time-blocked agenda per day: time range, agenda, units/pages, who is called (by character, alternate, or any company member, or "all actors called"), block notes, reorder
- Availability grid (A / UN / TBD / PART) per person per date, mirroring the *Prod & Actors Schedule* sheet. Tap to cycle, right-click for notes and partial time windows, bulk fill by weekday and date range. Actors can maintain their own row.
- Conflict detection: each agenda block flags called people who are UN, outside their partial window, TBD or haven't responded
- Availability checker: pick characters → who can make a date/time, plus the best dates in view ranked by availability
- Calendar cells show how many cast members are unavailable that day; overview shows the next two weeks
- Migration: `0002_calendar_availability.sql`

### ✅ Phase 3 · Collaborative SM reports
- Report types: Rehearsal, Tech, Performance, Meeting (meeting layout follows the *Portrait Meeting Report*: agenda, present, general notes, schedules given/received, next rehearsal date)
- One report per date, auto-numbered per type (Rehearsal Report #12)
- Created from the Reports page or from any calendar item ("SM report" button). Linking a calendar item pre-fills the time breakdown and attendance from that day's agenda and called list
- Department sections (Director, Script, Set, Props, Costume, Hair & Makeup, Lights, Sound, Video, Movement, Production, Venue, Next rehearsal…), custom sections, and a ⚑ flag for items a department must follow up
- **Real-time collaboration**: every section autosaves and syncs live; avatars show who has the report open and who is typing in which section; if someone edits a section you're typing in, you get a prompt instead of a silent overwrite
- Attendance / sign-in: present, late (with arrival time), absent, excused, notes; quick-add all cast or production team
- Running times for performances (house open, act up/down, curtain, house count, holds) with auto-computed act lengths, intermission and total; rehearsal/tech start, break and end times
- Draft → Final status
- Migration: `0003_reports.sql` (includes `create_report()` RPC and default section templates)

### ✅ Phase 4 · Script, blocking, cues, breakdown
- **Script import** from .docx, .txt or paste. Detects pages ("Page 12", "pg. 12", page breaks, lone page numbers), ACT / SCENE / UNIT headings (English and Filipino: Akto, Yugto, Eksena, Tagpo), speakers ("CANDIDO: …" or a name line), and stage directions in ( ) or [ ]. Preview before saving. Multiple versions; one marked current
- **Script navigation**: outline by act/scene/unit, jump to page, full-text search with next/prev, highlight one character's lines and list the pages they speak on, font size, ↑/↓ to move line by line
- **Markings per line**: blocking (with shorthand buttons: X, ENT, EXT, DSL, USR, C…), notes, line changes, colored highlights. Shown in the margin like a prompt book; mobile shows them under the line
- **Cues placed on the GO line** (LX, SQ, MX, VQ, FLY, SPOT, DECK, FX, SM) with auto-numbering, time/count, description and an optional standby mark N lines earlier. Filter cue departments in the script view
- **Edit the script in place**: fix a line's text, speaker, type or page; insert a line; delete a line
- **Cue Sheet**: all cues in running order, filter by department, group by act, edit inline, renumber a department, mark cut
- **Scene Breakdown** mirroring the *Sequence Breakdown* sheet: Act, Unit, French scene, Page, Setting, Characters, Entrance, Exit, Props, Set, Sound, Lights, Video, Costume, Movement, Remarks. Inline editing, insert/reorder rows, **paste straight from Excel / Google Sheets** with column mapping
- **Scene chart** (characters × scenes) from the breakdown, and an automatic chart from the script by scene or by page
- Migration: `0004_script_cues_breakdown.sql`

### ✅ Phase 5 · Exports & printables
Every list and report has an **Export ▾** menu:

| Document | Print / PDF | Word | Excel | Google Docs | Google Sheets |
|---|---|---|---|---|---|
| SM / Meeting report (with signature lines) | ✓ | ✓ | | ✓ | |
| Daily call sheet (from a calendar item) | ✓ | ✓ | | ✓ | |
| Rehearsal calendar (tabular, like the Portrait sheet) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Availability grid (color-coded) | ✓ | | ✓ | | ✓ |
| Company directory + cast list | ✓ | ✓ | ✓ | ✓ | ✓ |
| Task list | ✓ | ✓ | ✓ | ✓ | ✓ |
| Prompt book (script + blocking + cues + notes) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Cue sheet (all or per department) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Sequence breakdown | ✓ | ✓ | ✓ | ✓ | ✓ |
| Scene chart | ✓ | | ✓ | | ✓ |

- One document model renders three ways: print view (A4, portrait or landscape, header row repeats on every page, colors kept), `.docx` (via `docx`), `.xlsx` (via `exceljs`, print-ready page setup and fit to width)
- Print pages live at `/p/[id]/print/[kind]` with a clean paper layout. Use the browser's **Print → Save as PDF**
- **Google Docs / Sheets**: the generated file is uploaded to the user's Google Drive and converted, so it opens as an editable Google Doc or Sheet. Uses Google Identity Services in the browser (scope `drive.file`, which only touches files the app creates). No server secrets
- No database changes in this phase

### ✅ Phase 6 · SM toolkit extras
- **Props tracker**: prop, qty, type, where used, who handles it, preset location, source, status (Needed → Sourcing → Rehearsal prop → Show-ready, Repair, Cut) with status filters; paste from your existing props list; export
- **Line notes**: log dropped / paraphrased / wrong-word / jumped-cue notes per character and page during runs, mark as given, one-tap email per actor (opens your mail app with their notes), export grouped by character
- **Sign-in sheet** per calendar item (everyone called, sorted by first call, with Call / Time in / Signature / Time out), printable or Word/Excel
- **Overview dashboard**: days to opening, next two weeks of calls with agenda, latest reports, department follow-ups flagged ⚑ in reports, my tasks, SM team
- Live roster updates (members, characters) across open sessions
- Migration: `0005_props_linenotes.sql`

Migrations were tested end-to-end on Postgres 16 with Supabase-style auth stubs: sign-up → profile, invite linking (before and after sign-up), Head SM / ASM / actor / stranger permissions, task completion stamps, report creation from a calendar item (numbering, sections, attendance, time breakdown) and line insertion in scripts.

### ✅ Phase 7 · Import, reuse & hardening
- **Import files** page:
  - Excel SM paperwork (Directory, Tabular Calendar, Prod & Actors Schedule, Sequence/Actors Breakdown) with automatic sheet detection, merged-cell handling, month roll-over and character name matching
  - Word meeting reports (also turns a schedule in the notes into calendar days)
  - A box for pasting a schedule
  - Tested against `PORTRAIT_SM_Paperworks.xlsx` (22 people, 20 characters, 3 calendar days with 18 blocks, 25 availability rows, 51 breakdown rows) and `Portrait_Meeting_Report.docx` (5 attendees, 7 calendar days from the December agenda)
- **New production → Copy from** an earlier show (`duplicate_production()`): company (none / team / everyone), characters and casting, breakdown, props, script with blocking, and cues re-anchored to the copied script lines
- **Leave production** for non-Head members; the database keeps at least one Head SM with an account
- Bug fixes:
  - Reordering rows now re-sorts immediately (it used to wait for realtime)
  - Availability uses upsert: fast double-taps no longer hit the unique-key error, and Bulk fill is one batched request instead of hundreds
  - Report sections save pending typing on blur and when leaving the page, so the last keystrokes aren't lost
  - The calendar "SM report" button tells read-only users when no report exists yet
- One consolidated SQL file: `supabase/callboard_schema.sql`
- Migration: `0006_reuse_safety.sql`


### ✅ Phase 8 · Rehearsal-room UX, help and notifications
Goal: SMs update props, blocking, notes and attendance **during** rehearsal, not for an extra hour after.
- **Rehearsal Mode** (`/live`): quick capture (note → report section with time stamp and ⚑, prop, line note, task), now/next block with minutes left, rehearsal clock (start, 5/10/15-minute break countdown, resume, end, stamped into the report), one-tap attendance, today's report preview. Creates and links the day's report automatically
- **＋ Note** floating quick-capture on every production page; **phone bottom bar** (Live, Script, Props, Calendar, Reports)
- **Script blocking speed**: character and shorthand buttons, cursor stays in the box, *Enter = save + next line*, *Next line ↓*, Alt+↑/↓ while typing, Esc to close, **+ Prop from a line**
- **Props**: quick-add bar; phone card view with one-tap status. **Line notes**: chip-based quick entry
- **Help**: a ? button on every page (and the dashboard) with tips and shortcuts
- **Notifications**:
  - Toasts for every create / edit / delete, with **Undo** on adds and deletes, and readable error toasts
  - **Activity feed** (`activity` table, written by database triggers so it covers every device) with a 🔔 bell, unread count, live pop-ups for teammates' changes and optional desktop alerts
  - Bursts are merged (typing in a report, pasting 50 rows) and entries older than 60 days are removed
- Overview banner and calendar-day button to open Rehearsal Mode
- Migration: `0007_activity.sql`

### ✅ Phase 9 · New Supabase API keys
- Migrated from the legacy `anon` / `service_role` keys (retiring early 2027) to **`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`** (`sb_publishable_…`) and **`SUPABASE_SECRET_KEY`** (`sb_secret_…`)
- `lib/supabase/env.ts`: one place for config, with format checks; the middleware shows a clear "not configured" message instead of crashing
- `lib/supabase/admin.ts`: secret-key client, `server-only` guarded, rejects legacy keys
- **✉ Send invite** (Company & Cast, Head SM): `POST /api/invite` checks the caller is Head SM, then sends a Supabase invite email
- **`/auth/confirm`**: token-hash email link handler for invite, sign-up confirmation and password reset (Supabase SSR pattern), plus PKCE `code` support
- **`/api/health`**: deployment check (URL, key formats, secret-key exposure, schema, notifications table) without revealing any values
- No database changes

---

## 5. Project structure
```
app/
  page.tsx                 landing
  login, signup, forgot    auth screens
  auth/                    callback, signout, reset
  dashboard/               productions (new / copy from), my tasks
  account/                 profile
  p/[id]/                  production workspace (sidebar shell)
    page.tsx               overview: countdown, next 2 weeks, reports, follow-ups
    company/ tasks/ calendar/ availability/ reports/
    script/ cues/ breakdown/ props/ line-notes/
    live/                  Rehearsal Mode
    import/                import existing paperwork
    settings/              details, archive, leave, delete
    print/[kind]/          printable views for every export
  api/invite/              Head SM sends invite emails (secret key)
  api/health/              deployment check
  auth/confirm/            email link handler (invite / confirm / reset)
components/                ui (PageHeader + HelpButton), Toaster, EditableGrid, breakdown,
                           production/ (shell, provider, ActivityBell), live/ (QuickCapture, FAB),
                           schedule/, reports/, script/, export/
lib/
  supabase/                env.ts (keys + checks), client.ts / server.ts (publishable), admin.ts (secret, server-only)
  useRows.ts               realtime CRUD hook (paged, optimistic, upsert)
  importers.ts             xlsx / docx / text parsers (pure, testable)
  importApply.ts           writes import plans to the database
  capture.ts               rehearsal capture: note → report, prop, line note, task (with undo)
  notify.ts                toast bus
  help.ts                  text for every ? button
  export/                  doc model → print, docx, xlsx, Google Drive
  schedule.ts reports.ts scriptParse.ts types.ts roles.ts utils.ts nav.ts …
supabase/
  callboard_schema.sql     everything in one file (fresh projects)
  migrations/0001…0007     the same, split by phase
middleware.ts              session refresh + auth guard
```

### File manifest (93 files in `callboard/`)

```
.env.example
.gitignore
README.md
app/account/page.tsx
app/api/health/route.ts
app/api/invite/route.ts
app/auth/callback/route.ts
app/auth/confirm/route.ts
app/auth/reset/page.tsx
app/auth/signout/route.ts
app/dashboard/page.tsx
app/forgot/page.tsx
app/globals.css
app/layout.tsx
app/login/page.tsx
app/p/[id]/availability/page.tsx
app/p/[id]/breakdown/page.tsx
app/p/[id]/calendar/[eventId]/page.tsx
app/p/[id]/calendar/page.tsx
app/p/[id]/company/page.tsx
app/p/[id]/cues/page.tsx
app/p/[id]/import/page.tsx
app/p/[id]/layout.tsx
app/p/[id]/line-notes/page.tsx
app/p/[id]/live/page.tsx
app/p/[id]/page.tsx
app/p/[id]/print/[kind]/page.tsx
app/p/[id]/props/page.tsx
app/p/[id]/reports/[reportId]/page.tsx
app/p/[id]/reports/page.tsx
app/p/[id]/script/page.tsx
app/p/[id]/settings/page.tsx
app/p/[id]/tasks/page.tsx
app/page.tsx
app/signup/page.tsx
components/EditableGrid.tsx
components/Toaster.tsx
components/auth/AuthCard.tsx
components/breakdown.tsx
components/export/ExportMenu.tsx
components/export/PrintDoc.tsx
components/live/QuickCapture.tsx
components/live/QuickCaptureFab.tsx
components/production/ActivityBell.tsx
components/production/ProductionProvider.tsx
components/production/ProductionShell.tsx
components/reports/NewReportModal.tsx
components/schedule/CalledPicker.tsx
components/schedule/EventActions.tsx
components/schedule/NewEventModal.tsx
components/script/ImportScript.tsx
components/script/LinePanel.tsx
components/ui.tsx
lib/capture.ts
lib/export/docx.ts
lib/export/google.ts
lib/export/loaders.ts
lib/export/model.ts
lib/export/xlsx.ts
lib/fetchAll.ts
lib/help.ts
lib/importApply.ts
lib/importers.ts
lib/nav.ts
lib/notify.ts
lib/reports.ts
lib/roles.ts
lib/schedule.ts
lib/scriptParse.ts
lib/supabase/admin.ts
lib/supabase/client.ts
lib/supabase/env.ts
lib/supabase/server.ts
lib/types.ts
lib/usePresence.ts
lib/useRows.ts
lib/useSchedule.ts
lib/utils.ts
middleware.ts
next.config.mjs
package-lock.json
package.json
postcss.config.mjs
supabase/callboard_schema.sql
supabase/migrations/0001_foundation.sql
supabase/migrations/0002_calendar_availability.sql
supabase/migrations/0003_reports.sql
supabase/migrations/0004_script_cues_breakdown.sql
supabase/migrations/0005_props_linenotes.sql
supabase/migrations/0006_reuse_safety.sql
supabase/migrations/0007_activity.sql
tailwind.config.ts
tsconfig.json
```
