'use client';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Play, Square, Clock3, ChevronLeft, ChevronRight, Check, Coffee, BookOpen, Sparkles, ArrowUpRight, Flame, CalendarDays, Target } from 'lucide-react';
import {
  Session, dayKey, shiftDay, dailyTotal, duration, clock, streakDays, monthCells, heat, DEFAULT_GOAL_MS,
  goalLabel, remainText, dayTitle, monthTitle, weekDates, monthDates, sumDays, weekLabel, toLocalInput, fromLocalInput,
} from '../lib/study';

function newId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (v) => v.toString(16).padStart(2, '0')).join('');
}

const PIE_DONE = 'var(--accent)';

function Pie({ slices, quota, label, note, size }: { slices: { value: number; color: string }[]; quota: number; label: string; note: string; size: number }) {
  const used = slices.reduce((sum, slice) => sum + Math.max(0, slice.value), 0);
  const progress = Math.min(1, used / quota);
  const center = size / 2;
  const radius = size / 2 - 7;
  return <div className="ring-row">
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label} ${clock(used)}，满${goalLabel(quota)}`}>
      <circle className="ring-track" cx={center} cy={center} r={radius} strokeWidth="8" />
      <circle className="ring-value" cx={center} cy={center} r={radius} strokeWidth="8" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - progress * 100} transform={`rotate(-90 ${center} ${center})`} />
      <text className="ring-percentage" x={center} y={center} textAnchor="middle" dominantBaseline="central">{Math.floor(progress * 100)}%</text>
    </svg>
    <div><span>{label}</span><strong>{clock(used)}</strong><em>满{goalLabel(quota)} · {note}</em></div>
  </div>;
}

export default function Home() {
  const [rows, setRows] = useState<Session[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [goal, setGoal] = useState(DEFAULT_GOAL_MS);
  const [selected, setSelected] = useState('');
  const [monthCursor, setMonthCursor] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<Session | null>(null);
  const [draftStart, setDraftStart] = useState('');
  const [draftEnd, setDraftEnd] = useState('');
  const [keepOpen, setKeepOpen] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [view, setView] = useState<'today' | 'log'>('today');
  const [theme, setTheme] = useState('sunrise');
  const [scrolled, setScrolled] = useState(false);
  const surface = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLFormElement>(null);
  const offset = useRef(0);
  const locked = useRef(false);
  const pending = useRef<string | null>(null);
  const revision = useRef(0);

  const apply = useCallback((data: { now: number; sessions: Session[]; goalMs?: number }) => {
    offset.current = data.now - Date.now();
    setNow(data.now);
    setRows(data.sessions);
    if (typeof data.goalMs === 'number') setGoal(data.goalMs);
    setReady(true);
  }, []);

  const sync = useCallback(async () => {
    const version = revision.current;
    const res = await fetch('/api/study', { cache: 'no-store' });
    const data = await res.json() as { error?: string; now: number; sessions: Session[]; goalMs?: number };
    if (!res.ok) throw new Error(data.error);
    if (version !== revision.current) return;
    apply(data);
  }, [apply]);

  useEffect(() => {
    const refresh = () => {
      if (!locked.current) void sync().then(() => setError('')).catch(() => setError('暂时无法读取记录，请检查网络后重试。'));
    };
    refresh();
    const poll = setInterval(refresh, 15000);
    const tick = setInterval(() => setNow(Date.now() + offset.current), 250);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(poll); clearInterval(tick); window.removeEventListener('focus', refresh); };
  }, [sync]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try { const saved = localStorage.getItem('study-appearance'); if (['sunrise', 'violet', 'sage'].includes(saved || '')) setTheme(saved!); } catch { /* 外观偏好可不保存 */ }
    });
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', onScroll); };
  }, []);

  useEffect(() => {
    const elements = surface.current?.querySelectorAll('.reveal');
    if (!elements || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); } });
    }, { threshold: 0.08 });
    elements.forEach((element) => { element.classList.add('observed'); observer.observe(element); });
    return () => observer.disconnect();
  }, [view]);

  useEffect(() => {
    if (!editing) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sheet.current?.querySelector<HTMLInputElement>('input')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !locked.current) setEditing(null);
      if (event.key !== 'Tab') return;
      const items = sheet.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)');
      if (!items?.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; previous?.focus(); };
  }, [editing]);

  useEffect(() => {
    const read = () => setView(location.hash === '#log' ? 'log' : 'today');
    read();
    window.addEventListener('hashchange', read);
    window.addEventListener('popstate', read);
    return () => { window.removeEventListener('hashchange', read); window.removeEventListener('popstate', read); };
  }, []);

  async function post(body: Record<string, unknown>, okText: string) {
    if (locked.current || !ready) return false;
    locked.current = true;
    revision.current += 1;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/study', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json() as { error?: string; now: number; sessions: Session[]; goalMs?: number };
      if (!res.ok) throw new Error(data.error || '操作失败，请重试。');
      apply(data);
      setNotice(okText);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败，请重试。');
      return false;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  const active = rows.find((row) => row.ended === null);
  const today = dayKey(now);
  const picked = selected && selected <= today ? selected : shiftDay(today, -1);
  const date = view === 'log' ? picked : today;
  const total = dailyTotal(rows, today, now);
  const streak = streakDays(rows, goal, now);
  const todayHit = total >= goal;
  const dayRows = rows.filter((row) => dailyTotal([row], date, now) > 0 || dayKey(row.started) === date);
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(now); d.setDate(d.getDate() - 6 + i); return dayKey(d.getTime()); });
  const max = Math.max(3600000, ...days.map((d) => dailyTotal(rows, d, now)));
  const viewMonth = monthCursor ?? date.slice(0, 7);
  const [viewYear, viewMonthNumber] = viewMonth.split('-').map(Number);
  const cells = monthCells(viewYear, viewMonthNumber).reduce<string[][]>((weeks, day) => {
    const last = weeks[weeks.length - 1];
    if (!last || last.length === 7) weeks.push([day]);
    else last.push(day);
    return weeks;
  }, []).filter((week) => week.some((day) => day.slice(0, 7) === viewMonth)).flat();
  const selectedTotal = dailyTotal(rows, date, now);
  const rollTotal = sumDays(rows, days, now);
  const thisWeek = weekDates(date);
  const weekTotal = sumDays(rows, thisWeek, now);
  const monthTotal = sumDays(rows, monthDates(viewMonth).filter((d) => d <= today), now);
  const metInMonth = cells.filter((d) => d.slice(0, 7) === viewMonth && d <= today && dailyTotal(rows, d, now) >= goal).length;
  const todayCount = rows.filter((row) => dailyTotal([row], today, now) > 0 || dayKey(row.started) === today).length;
  const readback = useRef({ today, milliseconds: total, studying: !!active, goalMs: goal, streak });
  useEffect(() => { readback.current = { today, milliseconds: total, studying: !!active, goalMs: goal, streak }; }, [today, total, active, goal, streak]);

  useEffect(() => {
    const c = (document as Document & { modelContext?: { registerTool: (t: unknown, o: unknown) => void } }).modelContext;
    if (!c) return;
    const life = new AbortController();
    try {
      c.registerTool({
        name: 'read_study_time',
        description: '读取今日学习时间、目标和连续打卡',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true },
        execute: () => readback.current,
      }, { signal: life.signal });
    } catch { /* 没有宿主工具时忽略 */ }
    return () => life.abort();
  }, []);

  function go(next: 'today' | 'log', day?: string) {
    setConfirmId(null);
    setEditing(null);
    if (next === 'today') {
      setSelected('');
      setView('today');
      if (location.hash !== '#today') window.history.pushState(null, '', '#today');
    } else {
      const nextDay = day && day <= today ? day : picked;
      setSelected(nextDay);
      setMonthCursor(nextDay.slice(0, 7));
      setView('log');
      if (location.hash !== '#log') window.history.pushState(null, '', '#log');
    }
    window.scrollTo(0, 0);
  }

  function pickDate(next: string) {
    if (!next || next > today) return;
    setSelected(next);
    setMonthCursor(next.slice(0, 7));
    setConfirmId(null);
    setView('log');
    if (location.hash !== '#log') window.history.pushState(null, '', '#log');
  }

  function shiftMonth(delta: number) {
    const [y, m] = viewMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonthCursor(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  async function act() {
    if (locked.current || !ready) return;
    const action = active ? 'stop' : 'start';
    if (!active && !pending.current) pending.current = newId();
    const ok = await post({ action, id: active?.id ?? pending.current }, action === 'stop' ? '本次学习已保存，辛苦了。' : '已开始记录，专心学习吧。');
    if (ok) pending.current = null;
  }

  function openEdit(row: Session) {
    setConfirmId(null);
    setError('');
    setNotice('');
    setEditing(row);
    setDraftStart(toLocalInput(row.started));
    setKeepOpen(row.ended === null);
    setDraftEnd(toLocalInput(row.ended ?? now));
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const started = fromLocalInput(draftStart);
    const ended = keepOpen ? null : fromLocalInput(draftEnd);
    if (started == null) { setError('把开始时间填上'); return; }
    if (ended == null && !keepOpen) { setError('把结束时间填上'); return; }
    if (ended != null && ended < started) { setError('结束得比开始早'); return; }
    const ok = await post({ action: 'update', id: editing.id, started, ended }, '时间已改好');
    if (ok) setEditing(null);
  }

  async function remove(id: string) {
    const ok = await post({ action: 'delete', id }, '这段已删掉');
    if (ok) setConfirmId(null);
  }

  const startedDraft = fromLocalInput(draftStart);
  const endedDraft = keepOpen ? now : fromLocalInput(draftEnd);
  const draftMs = startedDraft != null && endedDraft != null && endedDraft >= startedDraft ? endedDraft - startedDraft : null;
  const anotherActive = !!editing && !!active && active.id !== editing.id;

  return <div className="study-app" data-theme={theme} ref={surface}>
    <a className="skip-link" href="#main-content" onClick={(event) => { event.preventDefault(); document.getElementById('main-content')?.focus(); }}>跳到主要内容</a>
    <header className={'site-header' + (scrolled ? ' scrolled' : '')}>
      <div className="header-inner">
        <button className="brand" type="button" onClick={() => go('today')} aria-label="时光自习室，返回今天"><span className="brand-icon"><BookOpen size={20} /></span><span>时光自习室<small>MAKE TIME MATTER</small></span></button>
        <nav className={'page-nav ' + view} aria-label="页面">
          <span className="nav-indicator" aria-hidden="true" />
          <button type="button" className={view === 'today' ? 'on' : ''} aria-current={view === 'today' ? 'page' : undefined} onClick={() => go('today')}><Clock3 size={15} />今天</button>
          <button type="button" className={view === 'log' ? 'on' : ''} aria-current={view === 'log' ? 'page' : undefined} onClick={() => go('log')}><CalendarDays size={15} />记录</button>
        </nav>
        <div className="theme-picker" role="group" aria-label="界面配色">{[{id: 'sunrise', label: '晨光'}, {id: 'violet', label: '暮紫'}, {id: 'sage', label: '松绿'}].map((option) => <button key={option.id} type="button" className={'theme-choice ' + option.id} aria-label={option.label + '配色'} aria-pressed={theme === option.id} title={option.label} onClick={() => { setTheme(option.id); try { localStorage.setItem('study-appearance', option.id); } catch { /* 可继续使用 */ } }}><span>{theme === option.id && <Check size={11} />}</span></button>)}</div>
      </div>
    </header>
    <main id="main-content" tabIndex={-1} className={view === 'log' ? 'log-page' : 'today-page'}>
      <div className="intro" key={view}>
        <div>
          <p className="eyebrow intro-eyebrow"><Sparkles size={13} />{view === 'today' ? 'A LITTLE FOCUS, EVERY DAY' : 'YOUR TIME, YOUR PROGRESS'}</p>
          <h1>{view === 'today' ? <>留一点时间，<span>给自己。</span></> : <>每一步，<span>都有迹可循。</span></>}</h1>
          <p className="muted">{view === 'today' ? '从一次专注开始，让努力慢慢成为日常。' : '翻翻走过的日子，看见一点一滴的积累。'}</p>
        </div>
        <div className="date-label"><CalendarDays size={15} />{view === 'today' ? new Date(now).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }) : dayTitle(date)}</div>
      </div>
      {view === 'today' ? <div className="today-layout">
        <section className={'timer-card reveal ' + (active ? 'running' : '')}>
          <div className="timer-orbit" aria-hidden="true"><span /><span /><span /></div>
          <div className="card-top"><span><i />{active ? '正在专注' : '准备就绪'}</span><span>FOCUS SESSION</span></div>
          <div className="timer-center">
            <span className="small-label">本次学习</span>
            <div className="timer" role="timer" aria-label="本次学习时长">{duration(active ? now - active.started : 0)}</div>
            <p>{active ? '慢慢来，保持你的节奏。' : '清空杂念，开始一段专注时光。'}</p>
            <button className="start-button" type="button" disabled={!ready || busy} onClick={() => void act()}>{active ? <Square size={16} fill="currentColor" /> : <Play size={18} fill="currentColor" />}{busy ? '正在保存…' : active ? '结束学习' : '开始学习'}</button>
            <span className="timer-help">{active ? '结束后，本次时长将自动计入今日' : '每天可以开始多次，学习时间自动累加'}</span>
          </div>
          <div className="card-bottom"><span><Clock3 size={13} />刷新页面也能继续计时</span><span className="session-number">SESSION {String(todayCount + (active ? 0 : 1)).padStart(2, '0')}</span></div>
        </section>
        <aside className="summary">
          <div className="today-card reveal">
            <Target className="summary-icon" size={20} />
            <p>今日累计学习</p>
            <div className="total">{clock(total)}<span>小时 / 分钟</span></div>
            <div className="goal-track" aria-hidden="true"><span className={'goal-fill' + (todayHit ? ' done' : '')} style={{ width: `${Math.min(100, (total / goal) * 100)}%` }} /></div>
            <div className="goal-meta"><span>目标 {goalLabel(goal)}</span><span>{remainText(total, goal)}</span></div>
            <div className="streak-pill"><Flame size={14} />连续达标 {streak} 天</div>
            <div className="summary-bottom"><span>今日学习 <b>{todayCount}</b> 次</span><span className="saved"><Check size={13} />{active ? '实时累计' : '自动保存'}</span></div>
            <Pie size={90} quota={goal} label="今天的进度" note={todayHit ? '今日目标已达成' : '每一分专注都算数'} slices={[{ value: total, color: PIE_DONE }]} />
          </div>
        </aside>
      </div> : <>
      <div className="log-top">
          <div className="week-card reveal">
            <div className="week-title"><h2>最近一周</h2><span><i className="met-dot on" />已达每日目标</span></div>
            <div className="bars">{days.map((d) => {
              const ms = dailyTotal(rows, d, now);
              const hit = ms >= goal;
              return <button key={d} type="button" className={'bar-column ' + (d === date ? 'chosen' : '')} onClick={() => pickDate(d)} aria-label={`${d} 学习 ${clock(ms)}${hit ? ' 已打满' : ''}`} title={`${clock(ms)}${hit ? ' 已打满' : ''}`}><span className={hit ? 'met-dot on' : 'met-dot'} /><span className="bar-track"><span className={'bar heat-' + heat(ms, goal)} style={{ height: `${Math.max(ms > 0 ? 8 : 3, ms / max * 100)}%` }} /></span><span>{d === today ? '今天' : Number(d.slice(-2)) + '日'}</span></button>;
            })}</div>
            <div className="week-total"><span>近7天合计</span><b>{clock(rollTotal)}</b></div>
          </div>
        <aside className="log-streak reveal">
          <p className="eyebrow"><Flame size={15} /> KEEP SHOWING UP</p>
          <div className="streak-block"><strong>{streak}</strong><span>天连续打满</span></div>
          <p className="side-note">{todayHit ? '今天算进连续里' : '今天还没打满'}</p>
          <p className="side-label">每日目标 {goalLabel(goal)}，积累自己的节奏。</p>
          <button type="button" className="text-link" onClick={() => go('today')}>开启今天的专注 <ArrowUpRight size={14} /></button>
        </aside>
      </div>
      <section className="month-board">
        <div className="month-card reveal">
          <div className="month-nav">
            <div>
              <p className="eyebrow">MONTH</p>
              <h2>{monthTitle(viewMonth)}</h2>
            </div>
            <div className="month-arrows">
              <button type="button" aria-label="上个月" onClick={() => shiftMonth(-1)}><ChevronLeft size={17} /></button>
              <button type="button" aria-label="下个月" disabled={viewMonth >= today.slice(0, 7)} onClick={() => shiftMonth(1)}><ChevronRight size={17} /></button>
            </div>
          </div>
          <div className="weekday-row">{'一二三四五六日'.split('').map((name) => <span key={name}>{name}</span>)}</div>
          <div className="month-grid">{cells.map((d) => {
            const ms = dailyTotal(rows, d, now);
            const future = d > today;
            const hit = !future && ms >= goal;
            return <button key={d} type="button" disabled={future} className={['day-cell', 'heat-' + heat(ms, goal), d.slice(0, 7) === viewMonth ? '' : 'out', future ? 'future' : '', d === date ? 'picked' : '', d === today ? 'today' : ''].filter(Boolean).join(' ')} onClick={() => pickDate(d)} aria-label={`${dayTitle(d)} ${ms > 0 ? '学了' + clock(ms) : '没学'}${hit ? ' 已打满' : ''}`}><span>{Number(d.slice(-2))}</span></button>;
          })}</div>
          <div className="legend"><span>没学</span><i className="swatch heat-0" /><i className="swatch heat-1" /><i className="swatch heat-2" /><i className="swatch heat-3" /><i className="swatch heat-4" /><i className="swatch heat-5" /><span>打满</span><em>越久越深</em></div>
        </div>
        <aside className="month-side reveal">
          <p className="eyebrow">时间的积累</p>
          <Pie size={124} quota={monthDates(viewMonth).length * goal} label="这个月学习" note={`打满${metInMonth}天`} slices={[{ value: monthTotal, color: PIE_DONE }]} />
          <Pie size={124} quota={thisWeek.length * goal} label="这周学习" note={weekLabel(thisWeek)} slices={[{ value: weekTotal, color: PIE_DONE }]} />
          <Pie size={124} quota={goal} label={dayTitle(date)} note={selectedTotal >= goal ? '这天打满了' : selectedTotal > 0 ? '这天还没满' : '这天还没学'} slices={[{ value: selectedTotal, color: PIE_DONE }]} />
        </aside>
      </section>
      </>}
      <div className="message" aria-live="polite">{editing ? '' : error ? <span className="error">{error} <button type="button" onClick={() => void sync().then(() => setError('')).catch(() => setError('读取失败，请稍后重试。'))}>重新读取</button></span> : notice}</div>
      <section className="records reveal">
        <div className="records-heading">
          <div><h2>{view === 'today' ? '今天的记录' : '学习记录'} <span>{dayRows.length}</span></h2><p>{view === 'today' ? '每一段认真投入的时间，都在这里。' : `${dayTitle(date)}的学习时段`}</p></div>
          {view === 'today' ? <button type="button" className="text-link" onClick={() => go('log')}>全部记录 <ArrowUpRight size={15} /></button> : <div className="date-picker">
            <button type="button" aria-label="前一天" onClick={() => { const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() - 1); pickDate(dayKey(d.getTime())); }}><ChevronLeft size={17} /></button>
            <input aria-label="查看日期" type="date" value={date} max={today} onChange={(e) => e.target.value && pickDate(e.target.value)} />
            <button type="button" aria-label="后一天" disabled={date >= today} onClick={() => { const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() + 1); pickDate(dayKey(d.getTime())); }}><ChevronRight size={17} /></button>
          </div>}
        </div>
        <div className="table-head"><span>学习时段</span><span>有效时长</span><span>状态</span><span>操作</span></div>
        {!ready ? <div className="empty"><Clock3 /><h3>{error ? '记录暂时不可用' : '正在读取学习记录…'}</h3></div> : dayRows.length === 0 ? <div className="empty"><span className="empty-icon"><Coffee size={26} /></span><h3>{view === 'today' ? '今天还没开始' : '这天还没记录'}</h3><p>{view === 'today' ? '点开始，记下第一段。' : '换一天看看。'}</p></div> : dayRows.map((row, i) => <div className="record-wrap" key={row.id}><div className="record"><span className="record-time"><span className="record-index">{String(dayRows.length - i).padStart(2, '0')}</span>{new Date(row.started).toLocaleTimeString('zh-CN', { hour12: false })} — {row.ended ? new Date(row.ended).toLocaleTimeString('zh-CN', { hour12: false }) : '现在'}{row.ended && dayKey(row.started) !== dayKey(row.ended) && <small>跨日</small>}</span><strong>{clock(dailyTotal([row], date, now))}</strong><span className={'record-status ' + (!row.ended ? 'live' : '')}>{row.ended ? '已完成' : '学习中'}</span><span className="record-actions"><button type="button" onClick={() => openEdit(row)}>改</button><button type="button" className="danger" onClick={() => setConfirmId(row.id)}>删</button></span></div>{confirmId === row.id && <div className="confirm-row">删掉这段？<button type="button" disabled={busy} onClick={() => void remove(row.id)}>删掉</button><button type="button" className="keep" onClick={() => setConfirmId(null)}>留下</button></div>}</div>)}
        <div className="records-footer"><span>按本地日期统计 · 跨日时长分别计算</span><span>当日合计 <b>{clock(dailyTotal(rows, date, now))}</b></span></div>
      </section>
      <footer><span><BookOpen size={14} />时光自习室</span><span>把时间，留给值得的事。</span></footer>
    </main>
    {editing && <div className="sheet-back" onClick={() => { if (!busy) setEditing(null); }}>
      <form className="sheet" ref={sheet} role="dialog" aria-modal="true" aria-label="改这段时间" onClick={(e) => e.stopPropagation()} onSubmit={(e) => void saveEdit(e)}>
        <h2>改这段时间</h2>
        <p className="muted">改完按新的开始和结束算。</p>
        <label>开始<input type="datetime-local" step={1} required value={draftStart} onChange={(e) => setDraftStart(e.target.value)} /></label>
        <label className="check"><input type="checkbox" checked={keepOpen} disabled={anotherActive} onChange={(e) => setKeepOpen(e.target.checked)} />还在学，先别停</label>
        {!keepOpen && <label>结束<input type="datetime-local" step={1} required value={draftEnd} onChange={(e) => setDraftEnd(e.target.value)} /></label>}
        {anotherActive && <p className="muted">已经有一段在学</p>}
        {draftMs != null && <div className="preview-time">{duration(draftMs)}</div>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="sheet-actions"><button className="save" type="submit" disabled={busy}>{busy ? '正在保存…' : '保存'}</button><button className="cancel" type="button" disabled={busy} onClick={() => setEditing(null)}>取消</button></div>
      </form>
    </div>}
  </div>;
}
