"use client";
import { useMemo, useState } from "react";
import { useProduction } from "@/components/production/ProductionProvider";
import { ConfirmButton, ErrorNote, Field, Modal, PageHeader, Tabs } from "@/components/ui";
import { useRows } from "@/lib/useRows";
import type { Task, TaskPriority, TaskStatus } from "@/lib/types";
import { DEPARTMENTS } from "@/lib/roles";
import { cx, fmtDate, todayISO } from "@/lib/utils";
import { ExportMenu } from "@/components/export/ExportMenu";

const STATUSES: { value: TaskStatus; label: string; tone: string }[] = [
  { value: "todo", label: "To do", tone: "bg-paper text-ink-soft" },
  { value: "in_progress", label: "In progress", tone: "bg-blue-50 text-blue-700" },
  { value: "blocked", label: "Blocked", tone: "bg-red-50 text-red-700" },
  { value: "done", label: "Done", tone: "bg-green-50 text-go" },
];
const PRIORITY_TONE: Record<TaskPriority, string> = {
  low: "text-ink-mute", normal: "text-ink-soft", high: "text-stby", urgent: "text-red-700",
};

export default function TasksPage() {
  const { production, isHead, canEdit, me, memberName, membersAZ } = useProduction();
  const tasks = useRows<Task>("tasks", production.id, { order: [{ column: "due_date" }, { column: "created_at" }] });
  const [filter, setFilter] = useState<"all" | "mine">(isHead ? "all" : "mine");
  const [assignee, setAssignee] = useState("");
  const [editing, setEditing] = useState<Task | "new" | null>(null);

  const visible = useMemo(() => tasks.rows.filter((t) =>
    (filter === "all" || t.assignee_id === me?.id) && (!assignee || t.assignee_id === assignee)
  ), [tasks.rows, filter, assignee, me]);

  const canChange = (t: Task) => isHead || t.assignee_id === me?.id;

  return (
    <>
      <PageHeader help="tasks"
        title="Tasks"
        subtitle={isHead ? "Assign work to your team. Assignees update status." : "Your assignments from the Head SM."}
        actions={
          <>
            <Tabs value={filter} onChange={setFilter} items={[{ value: "mine", label: "Mine" }, { value: "all", label: "All" }]} />
            {filter === "all" && (
              <select className="input w-44" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                <option value="">Everyone</option>
                {membersAZ.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
              </select>
            )}
            {canEdit && <button className="btn btn-primary" onClick={() => setEditing("new")}>{isHead ? "+ Assign task" : "+ Add task"}</button>}
            <ExportMenu kind="tasks" productionId={production.id} />
          </>
        }
      />
      <ErrorNote msg={tasks.error} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {STATUSES.map((s) => {
          const col = visible.filter((t) => t.status === s.value);
          return (
            <div key={s.value} className="rounded-lg bg-black/[0.03] p-2">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className={cx("chip", s.tone)}>{s.label}</span>
                <span className="text-xs text-ink-mute">{col.length}</span>
              </div>
              <div className="space-y-2">
                {col.map((t) => {
                  const overdue = t.due_date && t.status !== "done" && t.due_date < todayISO();
                  return (
                    <div key={t.id} className="card p-3">
                      <button className="block w-full text-left" onClick={() => setEditing(t)}>
                        <p className={cx("text-sm font-semibold", t.status === "done" && "line-through opacity-60")}>{t.title}</p>
                        {t.description && <p className="mt-1 line-clamp-2 text-xs text-ink-mute">{t.description}</p>}
                      </button>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                        <span className="font-medium">{memberName(t.assignee_id) || "Unassigned"}</span>
                        {t.due_date && <span className={overdue ? "font-semibold text-red-700" : "text-ink-mute"}>Due {fmtDate(t.due_date, { month: "short", day: "numeric" })}</span>}
                        <span className={cx("uppercase", PRIORITY_TONE[t.priority])}>{t.priority}</span>
                        {t.department && <span className="text-ink-mute">{t.department}</span>}
                      </div>
                      {canChange(t) && (
                        <select
                          className="input mt-2 py-1 text-xs"
                          value={t.status}
                          onChange={(e) => tasks.update(t.id, { status: e.target.value as TaskStatus })}
                        >
                          {STATUSES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                        </select>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <TaskEditor
          task={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            if (editing === "new") await tasks.insert({ ...patch, production_id: production.id });
            else await tasks.update(editing.id, patch);
            setEditing(null);
          }}
          onDelete={editing !== "new" && (isHead || editing.created_by === me?.user_id) ? async () => { await tasks.remove(editing.id); setEditing(null); } : undefined}
        />
      )}
    </>
  );
}

function TaskEditor({ task, onClose, onSave, onDelete }: {
  task: Task | null; onClose: () => void; onSave: (p: Partial<Task>) => Promise<void>; onDelete?: () => void;
}) {
  const { isHead, me, membersAZ, userId } = useProduction();
  const editable = !task || isHead || task.created_by === userId;
  const [f, setF] = useState<Partial<Task>>(task ?? {
    title: "", description: "", assignee_id: isHead ? null : me?.id ?? null, due_date: null,
    priority: "normal", status: "todo", department: "Stage Management", created_by: userId,
  });
  const [err, setErr] = useState<string | null>(null);
  const assignees = isHead ? membersAZ : membersAZ.filter((m) => m.id === me?.id);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await onSave({
        title: f.title, description: f.description || null, assignee_id: f.assignee_id || null,
        due_date: f.due_date || null, priority: f.priority, status: f.status, department: f.department || null,
        ...(task ? {} : { created_by: userId }),
      });
    } catch (e) { setErr((e as Error).message); }
  }

  return (
    <Modal open onClose={onClose} title={task ? "Task" : "New task"}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Title"><input className="input" required disabled={!editable} value={f.title ?? ""} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Details"><textarea className="input" rows={3} disabled={!editable} value={f.description ?? ""} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Assign to">
            <select className="input" disabled={!editable} value={f.assignee_id ?? ""} onChange={(e) => setF({ ...f, assignee_id: e.target.value || null })}>
              <option value="">Unassigned</option>
              {assignees.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
            </select>
          </Field>
          <Field label="Due"><input className="input" type="date" disabled={!editable} value={f.due_date ?? ""} onChange={(e) => setF({ ...f, due_date: e.target.value || null })} /></Field>
          <Field label="Priority">
            <select className="input" disabled={!editable} value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as TaskPriority })}>
              {(["low", "normal", "high", "urgent"] as TaskPriority[]).map((p) => <option key={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as TaskStatus })}>
              {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Department" className="sm:col-span-2">
            <select className="input" disabled={!editable} value={f.department ?? ""} onChange={(e) => setF({ ...f, department: e.target.value })}>
              <option value="">—</option>
              {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
            </select>
          </Field>
        </div>
        <ErrorNote msg={err} />
        <div className="flex items-center justify-between">
          {onDelete ? <ConfirmButton onConfirm={onDelete}>Delete task</ConfirmButton> : <span />}
          <button className="btn btn-primary">Save</button>
        </div>
      </form>
    </Modal>
  );
}
