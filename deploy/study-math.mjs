export const DEFAULT_GOAL_MS = 8 * 60 * 60 * 1000;

export function dayKey(t) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function shiftDay(date, delta) {
  const [y, m, d] = date.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + delta).getTime());
}

export function dailyTotal(rows, date, now) {
  const [y, m, d] = date.split('-').map(Number);
  const start = new Date(y, m - 1, d).getTime();
  const end = new Date(y, m - 1, d + 1).getTime();
  return rows.reduce((sum, row) => sum + Math.max(0, Math.min(row.ended ?? now, end) - Math.max(row.started, start)), 0);
}

export function duration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((v) => String(v).padStart(2, '0')).join(':');
}

export function clock(ms) {
  const minutes = Math.max(0, Math.floor(ms / 60000));
  return [Math.floor(minutes / 60), minutes % 60].map((v) => String(v).padStart(2, '0')).join(':');
}

export function streakDays(rows, goalMs, now) {
  if (!goalMs) return 0;
  const today = dayKey(now);
  let day = dailyTotal(rows, today, now) >= goalMs ? today : shiftDay(today, -1);
  let count = 0;
  while (count < 3660 && dailyTotal(rows, day, now) >= goalMs) {
    count += 1;
    day = shiftDay(day, -1);
  }
  return count;
}

export function monthCells(year, month) {
  const first = new Date(year, month - 1, 1);
  const lead = (first.getDay() + 6) % 7;
  const start = new Date(year, month - 1, 1 - lead);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    cells.push(dayKey(d.getTime()));
  }
  return cells;
}

export function heat(ms, goal) {
  if (ms <= 0) return 0;
  if (goal > 0 && ms >= goal) return 5;
  const hours = ms / 3600000;
  if (hours < 1) return 1;
  if (hours < 2) return 2;
  if (hours < 4) return 3;
  return 4;
}

export function weekDates(date) {
  const [y, m, d] = date.split('-').map(Number);
  const lead = (new Date(y, m - 1, d).getDay() + 6) % 7;
  const start = shiftDay(date, -lead);
  return Array.from({ length: 7 }, (_, i) => shiftDay(start, i));
}

export function monthDates(ym) {
  const [y, m] = ym.split('-').map(Number);
  const count = new Date(y, m, 0).getDate();
  return Array.from({ length: count }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`);
}

export function sumDays(rows, dates, now) {
  return dates.reduce((sum, date) => sum + dailyTotal(rows, date, now), 0);
}

export function weekLabel(dates) {
  const [, am, ad] = dates[0].split('-').map(Number);
  const [, bm, bd] = dates[6].split('-').map(Number);
  if (am === bm) return `${am}月${ad}日到${bd}日`;
  return `${am}月${ad}日到${bm}月${bd}日`;
}

export function goalLabel(ms) {
  const minutes = Math.round(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours && rest) return `${hours}小时${rest}分`;
  if (hours) return `${hours}小时`;
  return `${rest}分钟`;
}

export function remainText(total, goal) {
  if (total >= goal) return '今天已经打满';
  const left = Math.ceil((goal - total) / 60000);
  if (left <= 1) return '还差不到1分钟';
  const hours = Math.floor(left / 60);
  const rest = left % 60;
  if (hours && rest) return `还差${hours}小时${rest}分`;
  if (hours) return `还差${hours}小时`;
  return `还差${rest}分钟`;
}

export function shortSpan(ms) {
  if (ms <= 0) return '';
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes}分`;
  const tenth = Math.round(minutes / 6) / 10;
  return `${tenth}时`;
}

export function dayTitle(date) {
  const [y, m, d] = date.split('-').map(Number);
  const week = '日一二三四五六'[new Date(y, m - 1, d).getDay()];
  return `${m}月${d}日 周${week}`;
}

export function monthTitle(ym) {
  const [y, m] = ym.split('-');
  return `${y}年${Number(m)}月`;
}

export function toLocalInput(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function fromLocalInput(value) {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

export function validId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(id);
}

export function validGoal(ms) {
  return ms === DEFAULT_GOAL_MS;
}

export function checkTimes(started, ended, now) {
  if (!Number.isSafeInteger(started)) return '开始时间不对';
  if (ended !== null && !Number.isSafeInteger(ended)) return '结束时间不对';
  if (ended !== null && ended < started) return '结束得比开始早';
  const slack = now + 60 * 1000;
  if (started > slack) return '开始时间还没到';
  if (ended !== null && ended > slack) return '结束时间还没到';
  if (started < now - 5 * 365 * 24 * 60 * 60 * 1000) return '开始时间太早了';
  return null;
}

export function overlaps(rows, id, started, ended, now) {
  const end = ended ?? now;
  return rows.some((row) => row.id !== id && started < (row.ended ?? now) && end > row.started);
}

export function isUniqueError(error) {
  const message = String(error?.message || error || '');
  return message.includes('UNIQUE') || error?.errcode === 2067;
}
