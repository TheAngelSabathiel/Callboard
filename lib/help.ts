export type HelpTopic = { title: string; intro: string; tips: string[]; shortcuts?: [string, string][] };

/** In-app help shown by the ? button on every page. */
export const HELP: Record<string, HelpTopic> = {
  dashboard: {
    title: "Dashboard",
    intro: "All productions you belong to, and every task assigned to you.",
    tips: [
      "New production → Blank makes you the Head SM.",
      "New production → Copy from an earlier show brings over your team, casting, breakdown, props, script and cues. The calendar, reports and tasks start empty.",
      "Archived shows are hidden. Tick “Show archived” to see them.",
      "Were you added by email? Sign up with that exact email and the show appears here.",
    ],
  },
  overview: {
    title: "Overview",
    intro: "Today at a glance: countdown, next two weeks of calls, latest reports and department follow-ups.",
    tips: [
      "On a rehearsal day, tap “Rehearsal Mode” to run the room from one screen.",
      "⚑ items are report sections flagged for a department to follow up.",
      "The bell (top of the menu) lists everything your team changed. You get a pop-up when someone else adds, edits or deletes something.",
    ],
  },
  live: {
    title: "Rehearsal Mode",
    intro: "Built for the rehearsal room: log notes, props, blocking-related notes, line notes and attendance as they happen, so the report is done when rehearsal ends.",
    tips: [
      "Type a note, pick a department chip (Director, Props, Set…) and press Enter. It's added to today's report with a time stamp.",
      "“+ Prop” adds the item to the Props Tracker as Needed and also notes it in the report's Props section.",
      "“Line note” needs a character chip. Pick the issue chip, then type what was said.",
      "Tap names in Attendance: Present → Late (time stamped) → Absent → Excused.",
      "Use Start / Break / Resume / End to stamp rehearsal times into the report. The break timer counts down and turns red when time is up.",
      "Today's report is created automatically the first time you save anything.",
      "Blocking goes in the Script page. Tap “Open script” to jump there.",
    ],
    shortcuts: [["Enter", "Save the note"], ["Shift + Enter", "New line in the note"], ["N", "Focus the note box (anywhere on this page)"]],
  },
  company: {
    title: "Company & Cast",
    intro: "Everyone on the production, their contact details and app access, plus characters with actor and alternate.",
    tips: [
      "Add someone's email, then tap 🔗 Copy invite link and send it by chat (or ✉ Email): they open it, set a password and see the show. The badge changes from “Invite pending” to “Linked”.",
      "Head SM / SM / ASM can edit schedules, reports, script and cues. Everyone else reads, and updates their own availability.",
      "Paste from sheet: copy rows of Position · Name · Email · Phone from Excel or Google Sheets.",
      "Calendar called lists use the Cast tab, so give every character an actor.",
    ],
  },
  tasks: {
    title: "Tasks",
    intro: "The Head SM assigns. Assignees update the status.",
    tips: [
      "Change status on the card itself. No need to open it.",
      "Overdue dates turn red. Everyone's open tasks also show on their dashboard.",
      "SM / ASM can log tasks for themselves.",
    ],
  },
  calendar: {
    title: "Calendar",
    intro: "Every rehearsal, tech, show and meeting, each with a time-blocked agenda and who's called.",
    tips: [
      "Tap a day to see it, double-tap to add. “Repeat weekly until” creates a series.",
      "The red number on a day = cast marked unavailable.",
      "Agenda view is the tabular calendar. Export it for the company.",
      "Open a day for the call sheet, the sign-in sheet and its SM report.",
    ],
  },
  event: {
    title: "Day agenda",
    intro: "Build the day block by block and call people per block.",
    tips: [
      "Tap character chips to call them; “alt” calls the alternate. “All actors called” calls the whole cast.",
      "A red block means a called person is unavailable. “Unconfirmed” means TBD or no answer.",
      "Duplicate copies the day and its agenda to another date.",
      "Call sheet and Sign-in sheet print from the buttons at the top.",
    ],
  },
  availability: {
    title: "Availability",
    intro: "Who can come, day by day.",
    tips: [
      "Tap a cell to cycle A → UN → TBD → PART → blank. Switch to “Tap: details” (or right-click) for notes and partial times.",
      "Bulk fill sets many days at once, e.g. everyone A on weekdays.",
      "Actors can fill their own row from their phone.",
      "The checker below ranks the best dates for the characters you pick.",
    ],
  },
  reports: {
    title: "Reports",
    intro: "Rehearsal, tech, performance and meeting reports, numbered per type.",
    tips: [
      "Fastest way: open the day in Calendar → “SM report”, or use Rehearsal Mode, which fills in today's report as you go.",
      "Linking a calendar day pre-fills the time breakdown and attendance.",
    ],
  },
  report: {
    title: "Writing a report",
    intro: "The whole SM team can write at the same time. Every section saves by itself.",
    tips: [
      "Avatars at the top show who has the report open. “… typing” shows who is in which section.",
      "If someone changes the section you're in, you'll be asked before your text is replaced.",
      "⚑ flags a section for department follow-up. It appears on the Overview.",
      "Mark final, then Export → Word, PDF or Google Docs to send.",
    ],
  },
  script: {
    title: "Script & Blocking",
    intro: "Mark blocking, notes and cues on the exact line during rehearsal.",
    tips: [
      "Tap a line, type blocking (shorthand and character buttons help), press Enter. With “Enter = next line” on, the next line is selected so you can keep going.",
      "Cue tab: pick the department, check the number, and choose a standby a few lines earlier.",
      "Note tab → “+ Prop” sends an item straight to the Props Tracker with the page number.",
      "Highlight character shows a role's lines and the pages they're on, which helps line runs and actor questions.",
      "Edit tab fixes the text when the script changes in the room.",
    ],
    shortcuts: [["↑ / ↓", "Previous / next line"], ["Alt + ↑ / ↓", "Move lines while typing"], ["Enter", "Save blocking (and go to the next line if turned on)"], ["Shift + Enter", "New line inside the blocking"], ["Esc", "Close the line panel"]],
  },
  cues: {
    title: "Cue Sheet",
    intro: "Every cue in running order. Cues placed in the script appear here automatically.",
    tips: [
      "Filter a department and export its sheet for the operator.",
      "Renumber sets a department to 1…n after cuts and additions.",
      "Mark a cue Cut instead of deleting it to keep its history.",
    ],
  },
  breakdown: {
    title: "Scene Breakdown",
    intro: "French scenes / units with who's on, entrances, exits and every department.",
    tips: [
      "Click a cell to edit; it saves when you leave the cell. ＋ inserts a row below.",
      "Paste rows straight from your existing breakdown sheet.",
      "Scene chart uses the Characters column; use the same names as the Cast list.",
    ],
  },
  props: {
    title: "Props Tracker",
    intro: "Log props the moment they come up in rehearsal.",
    tips: [
      "Quick add at the top: name, where it's used and who handles it, then Enter.",
      "Status chips filter the list: Needed, Sourcing, Rehearsal prop, Show-ready, Repair, Cut.",
      "Props added in Rehearsal Mode or from a script line land here as Needed.",
    ],
    shortcuts: [["Enter", "Add the prop"]],
  },
  linenotes: {
    title: "Line Notes",
    intro: "Catch text errors during runs and send each actor their notes.",
    tips: [
      "Quick entry: tap the character, the issue, type the page and what was said, then Enter.",
      "“Send to actors” opens your email with each actor's notes filled in.",
      "Tick “Given” once notes are delivered.",
    ],
    shortcuts: [["Enter", "Save the line note"]],
  },
  import: {
    title: "Import files",
    intro: "Bring in the paperwork you already have. Imports only add; nothing is deleted.",
    tips: [
      "Workbook: check each sheet's type. Directory is imported first so “Called” names match characters.",
      "Availability: set the year of the first month. Later months roll over.",
      "Meeting reports: set the meeting date for each file. A schedule in the notes can become calendar days.",
      "Scripts are imported on the Script page.",
    ],
  },
  settings: {
    title: "Settings",
    intro: "Production details print on every report header.",
    tips: [
      "Opening date drives the countdown on the Overview.",
      "Archive a finished show. Start the next one from the dashboard with “Copy from”.",
      "Hand over Head SM by promoting someone else in Company & Cast first.",
    ],
  },
};
