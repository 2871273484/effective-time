import { database } from '../../../db/raw';
import { DEFAULT_GOAL_MS, validId, validGoal, checkTimes, overlaps, isUniqueError } from '../../../lib/study-math.mjs';
export const dynamic = 'force-dynamic';

type Payload = { action?: string; id?: string; started?: number; ended?: number | null; goalMs?: number };
type Row = { id: string; started: number; ended: number | null };

async function ready(db: ReturnType<typeof database>) {
  await db.prepare('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)').run();
  await db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (\'daily_goal_ms\', ?)').bind(String(DEFAULT_GOAL_MS)).run();
  await db.prepare('UPDATE settings SET value = ? WHERE key = \'daily_goal_ms\'').bind(String(DEFAULT_GOAL_MS)).run();
}

async function readGoal(db: ReturnType<typeof database>) {
  const goal = await db.prepare('SELECT value FROM settings WHERE key = \'daily_goal_ms\'').all<{ value: string }>();
  const n = Number(goal.results?.[0]?.value);
  return Number.isSafeInteger(n) ? n : DEFAULT_GOAL_MS;
}

async function snapshot(db: ReturnType<typeof database>) {
  await ready(db);
  const sessions = await db.prepare('SELECT id, started, ended FROM sessions ORDER BY started DESC').all<Row>();
  return Response.json({ sessions: sessions.results, now: Date.now(), goalMs: await readGoal(db) }, { headers: { 'Cache-Control': 'no-store' } });
}

function fail(status: number, error: string) {
  return Response.json({ error }, { status });
}

export async function GET() {
  try { return await snapshot(database()); }
  catch (e) { console.error(e); return fail(503, '暂时无法读取记录，请重试。'); }
}

export async function POST(request: Request) {
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return new Response('Forbidden', { status: 403 });
  try {
    const body = await request.json() as Payload;
    const db = database();
    await ready(db);
    if (body?.action === 'goal') {
      if (!validGoal(body.goalMs)) return fail(400, '每天必须满8小时');
      await db.prepare('UPDATE settings SET value = ? WHERE key = \'daily_goal_ms\'').bind(String(body.goalMs)).run();
      return await snapshot(db);
    }
    if (!body || !['start', 'stop', 'update', 'delete'].includes(body.action ?? '') || !validId(body.id)) return fail(400, '无效操作');
    if (body.action === 'start') {
      try { await db.prepare('INSERT OR IGNORE INTO sessions (id, started, active) VALUES (?, ?, 1)').bind(body.id, Date.now()).run(); }
      catch (error) { if (isUniqueError(error)) return fail(409, '已经有一段在学'); throw error; }
      return await snapshot(db);
    }
    if (body.action === 'stop') {
      await db.prepare('UPDATE sessions SET ended = MAX(started, ?), active = NULL WHERE id = ? AND ended IS NULL').bind(Date.now(), body.id).run();
      return await snapshot(db);
    }
    if (body.action === 'delete') {
      await db.prepare('DELETE FROM sessions WHERE id = ?').bind(body.id).run();
      return await snapshot(db);
    }
    const now = Date.now();
    const ended = body.ended === null ? null : body.ended;
    const problem = checkTimes(body.started, ended, now);
    if (problem) return fail(400, problem);
    const existing = await db.prepare('SELECT id, started, ended FROM sessions').all<Row>();
    const rows = existing.results ?? [];
    if (!rows.some((row) => row.id === body.id)) return fail(404, '找不到这段');
    if (overlaps(rows, body.id, body.started, ended, now)) return fail(409, '这段和别的重叠了');
    if (ended === null && rows.some((row) => row.id !== body.id && row.ended === null)) return fail(409, '已经有一段在学');
    try {
      const result = await db.prepare('UPDATE sessions SET started = ?, ended = ?, active = ? WHERE id = ?').bind(body.started, ended, ended === null ? 1 : null, body.id).run() as { meta?: { changes?: number } };
      if (!result.meta?.changes) return fail(404, '找不到这段');
    } catch (error) {
      if (isUniqueError(error)) return fail(409, '已经有一段在学');
      throw error;
    }
    return await snapshot(db);
  } catch (e) { console.error(e); return fail(503, '保存未完成，请重试。'); }
}
