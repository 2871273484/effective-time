import { DEFAULT_GOAL_MS, validId, validGoal, checkTimes, overlaps, isUniqueError } from './study-math.mjs';

export function createStudyApi(db) {
  db.exec('CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)');
  db.prepare('INSERT OR IGNORE INTO settings(key, value) VALUES(\'daily_goal_ms\', ?)').run(String(DEFAULT_GOAL_MS));
  db.prepare('UPDATE settings SET value = ? WHERE key = \'daily_goal_ms\'').run(String(DEFAULT_GOAL_MS));
  const all = db.prepare('SELECT id, started, ended FROM sessions ORDER BY started DESC');
  const start = db.prepare('INSERT OR IGNORE INTO sessions(id, started, active) VALUES(?, ?, 1)');
  const stop = db.prepare('UPDATE sessions SET ended = MAX(started, ?), active = NULL WHERE id = ? AND ended IS NULL');
  const remove = db.prepare('DELETE FROM sessions WHERE id = ?');
  const update = db.prepare('UPDATE sessions SET started = ?, ended = ?, active = ? WHERE id = ?');
  const readGoal = db.prepare('SELECT value FROM settings WHERE key = \'daily_goal_ms\'');
  const writeGoal = db.prepare('UPDATE settings SET value = ? WHERE key = \'daily_goal_ms\'');

  function goalMs() {
    const row = readGoal.get();
    const n = Number(row?.value);
    return Number.isSafeInteger(n) ? n : DEFAULT_GOAL_MS;
  }

  function payload() {
    return { sessions: all.all(), now: Date.now(), goalMs: goalMs() };
  }

  function apply(body) {
    if (!body || typeof body !== 'object') return { status: 400, error: '无效请求' };
    if (body.action === 'goal') {
      if (!validGoal(body.goalMs)) return { status: 400, error: '每天必须满8小时' };
      writeGoal.run(String(body.goalMs));
      return null;
    }
    if (!['start', 'stop', 'update', 'delete'].includes(body.action) || !validId(body.id)) return { status: 400, error: '无效操作' };
    if (body.action === 'start') {
      try { start.run(body.id, Date.now()); }
      catch (error) { if (isUniqueError(error)) return { status: 409, error: '已经有一段在学' }; throw error; }
      return null;
    }
    if (body.action === 'stop') { stop.run(Date.now(), body.id); return null; }
    if (body.action === 'delete') { remove.run(body.id); return null; }
    const now = Date.now();
    const ended = body.ended === null ? null : body.ended;
    const problem = checkTimes(body.started, ended, now);
    if (problem) return { status: 400, error: problem };
    db.exec('BEGIN IMMEDIATE');
    try {
      const rows = all.all();
      if (!rows.some((row) => row.id === body.id)) { db.exec('ROLLBACK'); return { status: 404, error: '找不到这段' }; }
      if (overlaps(rows, body.id, body.started, ended, now)) { db.exec('ROLLBACK'); return { status: 409, error: '这段和别的重叠了' }; }
      if (ended === null && rows.some((row) => row.id !== body.id && row.ended === null)) { db.exec('ROLLBACK'); return { status: 409, error: '已经有一段在学' }; }
      const result = update.run(body.started, ended, ended === null ? 1 : null, body.id);
      if (!result.changes) { db.exec('ROLLBACK'); return { status: 404, error: '找不到这段' }; }
      db.exec('COMMIT');
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch { /* already closed */ }
      if (isUniqueError(error)) return { status: 409, error: '已经有一段在学' };
      throw error;
    }
    return null;
  }

  return { payload, apply };
}
