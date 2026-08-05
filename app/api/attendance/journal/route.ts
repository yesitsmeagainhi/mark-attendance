import {eq, and} from "drizzle-orm";
import {getDb} from "../../../../db";
import {dailyJournals} from "../../../../db/schema";
import {getAppIdentity} from "../../../authz";

export async function GET(request: Request) {
    const identity = await getAppIdentity();
    if (!identity) 
        return Response.json({ error: "Not authenticated."},
    {status: 401});

    const date = new URL(request.url).searchParams.get("date");
    if (!date)
        return Response.json({ error: "Date required."},
    {status: 400});

    const db = getDb();
    const journal = db
    .select()
    .from(dailyJournals)
    .where(and(
        eq(dailyJournals.employeeId, identity.employeeId),
        eq(dailyJournals.date, date)
    ))
    .get();
    return Response.json({
        journal: journal
          ? { ...journal, todos: journal.todos ? JSON.parse(journal.todos) : []}
          :null,
    })
}

export async function POST(request: Request) {
  const identity = await getAppIdentity();
  if (!identity) return Response.json({ error: "Not authenticated." }, { status: 401 });

  const body = await request.json();
  const { date, tasks, todos } = body;

  if (!date || !tasks?.trim()) {
    return Response.json({ error: "Date and tasks are required." }, { status: 400 });
  }

  const db = getDb();
  const existing = db
    .select({ id: dailyJournals.id })
    .from(dailyJournals)
    .where(and(eq(dailyJournals.employeeId, identity.employeeId), eq(dailyJournals.date, date)))
    .get();

  const now = new Date().toISOString();
  const todosJson = JSON.stringify(todos || []);

  if (existing) {
    db.update(dailyJournals)
      .set({ tasks: tasks.trim(), todos: todosJson, updatedAt: now })
      .where(eq(dailyJournals.id, existing.id))
      .run();
    return Response.json({ ok: true, id: existing.id });
  }

  const id = crypto.randomUUID();
  db.insert(dailyJournals).values({
    id,
    employeeId: identity.employeeId,
    date,
    tasks: tasks.trim(),
    todos: todosJson,
  }).run();

  return Response.json({ ok: true, id }, { status: 201 });
}
