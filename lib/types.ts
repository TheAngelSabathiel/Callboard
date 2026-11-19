export type MemberRole =
  | "head_sm" | "sm" | "asm" | "director" | "production_manager"
  | "designer" | "crew" | "actor" | "viewer";

export type Production = {
  id: string;
  title: string;
  subtitle: string | null;
  produced_by: string | null;
  directed_by: string | null;
  venue: string | null;
  rehearsal_venue: string | null;
  show_dates: string | null;
  first_rehearsal: string | null;
  opening_date: string | null;
  closing_date: string | null;
  script_version: string | null;
  accent_color: string | null;
  archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Member = {
  id: string;
  production_id: string;
  user_id: string | null;
  role: MemberRole;
  display_name: string;
  position: string | null;
  department: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  sort_order: number;
};

export type Character = {
  id: string;
  production_id: string;
  name: string;
  description: string | null;
  actor_id: string | null;
  alternate_id: string | null;
  sort_order: number;
};

export type TaskStatus = "todo" | "in_progress" | "blocked" | "done";
export type TaskPriority = "low" | "normal" | "high" | "urgent";

export type Task = {
  id: string;
  production_id: string;
  title: string;
  description: string | null;
  department: string | null;
  assignee_id: string | null;
  created_by: string | null;
  due_date: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

// ---------- Phase 2 ----------
export type EventType =
  | "rehearsal" | "tech" | "dress" | "show" | "meeting" | "fitting" | "shoot" | "load_in" | "strike" | "other";

export type ProdEvent = {
  id: string;
  production_id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  call_time: string | null;
  type: EventType;
  title: string;
  venue: string | null;
  notes: string | null;
  reminders: string | null;
  published: boolean;
  created_at: string;
};

export type EventBlock = {
  id: string;
  event_id: string;
  production_id: string;
  start_time: string | null;
  end_time: string | null;
  agenda: string;
  scenes: string | null;
  called_ids: string[];
  called_all: boolean;
  notes: string | null;
  sort_order: number;
};

export type AvailabilityStatus = "A" | "UN" | "TBD" | "PART";

export type Availability = {
  id: string;
  production_id: string;
  member_id: string;
  date: string;
  status: AvailabilityStatus;
  from_time: string | null;
  to_time: string | null;
  note: string | null;
};

// ---------- Phase 3 ----------
export type ReportType = "rehearsal" | "performance" | "tech" | "meeting";

export type Report = {
  id: string;
  production_id: string;
  event_id: string | null;
  type: ReportType;
  number: number | null;
  date: string;
  title: string | null;
  venue: string | null;
  start_time: string | null;
  end_time: string | null;
  agenda: string | null;
  timings: Record<string, string>;
  prepared_by: string | null;
  status: "draft" | "final";
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ReportSection = {
  id: string;
  report_id: string;
  production_id: string;
  key: string;
  title: string;
  body: string;
  needs_attention: boolean;
  sort_order: number;
  updated_by: string | null;
  updated_at: string;
};

export type AttendanceStatus = "present" | "late" | "absent" | "excused" | "not_called";

export type Attendance = {
  id: string;
  report_id: string;
  production_id: string;
  member_id: string;
  status: AttendanceStatus;
  arrival_time: string | null;
  note: string | null;
};

// ---------- Phase 4 ----------
export type Script = {
  id: string;
  production_id: string;
  title: string;
  version: string | null;
  is_current: boolean;
  created_at: string;
};

export type LineKind = "dialogue" | "direction" | "heading" | "character" | "blank";

export type ScriptLine = {
  id: string;
  script_id: string;
  production_id: string;
  idx: number;
  page: number;
  act: string | null;
  scene: string | null;
  kind: LineKind;
  speaker: string | null;
  text: string;
};

export type MarkType = "blocking" | "note" | "highlight" | "line_change";

export type ScriptMark = {
  id: string;
  script_id: string;
  production_id: string;
  line_id: string;
  type: MarkType;
  text: string | null;
  color: string | null;
  char_start: number | null;
  char_end: number | null;
  created_by: string | null;
  created_at: string;
};

export type Cue = {
  id: string;
  production_id: string;
  script_id: string | null;
  line_id: string | null;
  dept: string;
  number: string;
  page: string | null;
  act: string | null;
  scene: string | null;
  trigger: string | null;
  description: string | null;
  duration: string | null;
  standby_line_id: string | null;
  notes: string | null;
  sort_key: number;
  status: "draft" | "set" | "cut";
};

export type SceneRow = {
  id: string;
  production_id: string;
  act: string | null;
  unit: string | null;
  french_scene: string | null;
  page: string | null;
  setting: string | null;
  characters: string | null;
  entrances: string | null;
  exits: string | null;
  props: string | null;
  set_notes: string | null;
  sound: string | null;
  lights: string | null;
  video: string | null;
  costume: string | null;
  movement: string | null;
  remarks: string | null;
  sort_order: number;
};

// ---------- Phase 6 ----------
export type Prop = {
  id: string;
  production_id: string;
  name: string;
  category: string | null;
  scene: string | null;
  character: string | null;
  preset: string | null;
  source: string | null;
  status: string | null;
  quantity: number | null;
  notes: string | null;
  sort_order: number;
};

export type LineNote = {
  id: string;
  production_id: string;
  date: string;
  character: string | null;
  member_id: string | null;
  page: string | null;
  line: string | null;
  issue: string | null;
  note: string | null;
  sent: boolean;
  sort_order: number;
};

// ---------- Phase 8 ----------
export type Activity = {
  id: string;
  production_id: string;
  user_id: string | null;
  actor_name: string | null;
  table_name: string;
  row_id: string | null;
  action: "insert" | "update" | "delete";
  label: string | null;
  count: number;
  created_at: string;
  updated_at: string;
};
