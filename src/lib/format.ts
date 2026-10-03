/** Dates, durations and sizes, written the way people say them. */

// Intl formatters are costly to create; make each once.
const weekdayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'long' });
const dayMonthFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
const fullDateFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const weekdayDayFmt = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'short',
});

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "Just now", "12 min ago", "3 h ago", "Yesterday", "Tuesday", "12 Sep". */
export function relativeTime(t: number, now = Date.now()): string {
  const diff = now - t;
  if (diff < 0) return timeOfDay(t);
  if (diff < MIN) return 'Just now';
  if (diff < HOUR) return `${Math.floor(diff / MIN)} min ago`;
  const days = Math.round((startOfDay(now) - startOfDay(t)) / DAY);
  if (days === 0) return `${Math.floor(diff / HOUR)} h ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return weekdayFmt.format(t);
  return dayMonthFmt.format(t);
}

/** "10:00" (24-hour, as most of the world reads it). */
export function timeOfDay(t: number): string {
  return timeFmt.format(t);
}

/** "Today", "Yesterday", "Earlier this week", "Earlier" — for grouping lists. */
export function dayGroup(t: number, now = Date.now()): string {
  const days = Math.round((startOfDay(now) - startOfDay(t)) / DAY);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return 'Earlier this week';
  return 'Earlier';
}

/** "42 min", "1 h 1 min". */
export function duration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** "12:40", "1:02:03" — player and transcript timestamps. */
export function timestamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** "84 KB", "1.8 MB". */
export function fileSize(kb: number): string {
  return kb < 1000 ? `${kb} KB` : `${(kb / 1000).toFixed(1).replace(/\.0$/, '')} MB`;
}

/** "Due today", "Due Friday", "Due 12 Oct". */
export function dueLabel(t: number, now = Date.now()): string {
  const days = Math.round((startOfDay(t) - startOfDay(now)) / DAY);
  if (days < 0) return 'Overdue';
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days < 7) return `Due ${weekdayFmt.format(t)}`;
  return `Due ${dayMonthFmt.format(t)}`;
}

/** "Today at 10:00", "Yesterday at 14:30", "Tuesday at 09:15", "12 Sep at 10:00". */
export function dayAndTime(t: number, now = Date.now()): string {
  const days = Math.round((startOfDay(now) - startOfDay(t)) / DAY);
  const time = timeOfDay(t);
  if (days === 0) return `Today at ${time}`;
  if (days === 1) return `Yesterday at ${time}`;
  if (days > 1 && days < 7) return `${weekdayFmt.format(t)} at ${time}`;
  return `${dayMonthFmt.format(t)} at ${time}`;
}

/** For lists already grouped by day: the time today and yesterday, the weekday or date before. */
export function whenInGroup(t: number, now = Date.now()): string {
  const days = Math.round((startOfDay(now) - startOfDay(t)) / DAY);
  if (days <= 1) return timeOfDay(t);
  if (days < 7) return weekdayFmt.format(t);
  return dayMonthFmt.format(t);
}

/** "Updated 2 h ago", "Updated yesterday", "Updated Monday", "Updated 12 Sep". */
export function updatedLabel(t: number, now = Date.now()): string {
  const rel = relativeTime(t, now);
  const lower = /ago$|^Just now$|^Yesterday$/.test(rel)
    ? rel.charAt(0).toLowerCase() + rel.slice(1)
    : rel;
  return `Updated ${lower}`;
}

/** "3 Oct 2026". */
export function fullDate(t: number): string {
  return fullDateFmt.format(t);
}

/** "3 Oct 2026 at 14:32": an exact moment (audit details). */
export function dateAndTime(t: number): string {
  return `${fullDateFmt.format(t)} at ${timeFmt.format(t)}`;
}

/** A day's heading in a dated list: "Today", "Yesterday", "Tuesday 29 Sep", "12 Aug 2025". */
export function dayHeading(t: number, now = Date.now()): string {
  const days = Math.round((startOfDay(now) - startOfDay(t)) / DAY);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (new Date(t).getFullYear() === new Date(now).getFullYear()) return weekdayDayFmt.format(t);
  return fullDateFmt.format(t);
}

/** An invite's time left: "Expires today", "Expires tomorrow", "Expires in 5 days", "Expired". */
export function expiresLabel(t: number, now = Date.now()): string {
  if (t <= now) return 'Expired';
  const days = Math.round((startOfDay(t) - startOfDay(now)) / DAY);
  if (days <= 0) return 'Expires today';
  if (days === 1) return 'Expires tomorrow';
  return `Expires in ${days} days`;
}
