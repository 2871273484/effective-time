export type Session = { id: string; started: number; ended: number | null };

export {
  DEFAULT_GOAL_MS,
  dayKey,
  shiftDay,
  dailyTotal,
  duration,
  clock,
  streakDays,
  monthCells,
  heat,
  weekDates,
  monthDates,
  sumDays,
  weekLabel,
  goalLabel,
  remainText,
  shortSpan,
  dayTitle,
  monthTitle,
  toLocalInput,
  fromLocalInput,
} from './study-math.mjs';
