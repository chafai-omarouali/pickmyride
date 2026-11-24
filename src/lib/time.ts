/** Tijden worden als UTC (timestamptz) opgeslagen en in Europe/Amsterdam getoond. */
export const TZ = 'Europe/Amsterdam';

const partsFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });

function amsParts(d: Date) {
  const p = Object.fromEntries(partsFmt.formatToParts(d).map(x => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}
/** Offset van Amsterdam t.o.v. UTC (ms) op moment d. */
function offsetMs(d: Date) {
  const p = amsParts(d);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(d.getTime() / 1000) * 1000;
}

export type ParseResult = { ok: true; date: Date } | { ok: false; error: string };

/** Zet een lokale Amsterdamse datum ('YYYY-MM-DD') en tijd ('HH:MM') om naar een UTC-moment. */
export function amsterdamToUtc(dateStr: string, timeStr: string): ParseResult {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || '');
  const tm = /^(\d{2}):(\d{2})$/.exec(timeStr || '');
  if (!dm) return { ok: false, error: 'Vul een geldige datum in.' };
  if (!tm) return { ok: false, error: 'Vul een geldige tijd in (uu:mm).' };
  const [y, mo, d, h, mi] = [+dm[1], +dm[2], +dm[3], +tm[1], +tm[2]];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return { ok: false, error: 'Vul een geldige datum en tijd in.' };
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  if (new Date(naive).getUTCDate() !== d) return { ok: false, error: 'Deze datum bestaat niet.' };
  let utc = naive - offsetMs(new Date(naive));
  utc = naive - offsetMs(new Date(utc));
  const back = amsParts(new Date(utc));
  if (back.h !== h || back.mi !== mi || back.d !== d)
    return { ok: false, error: 'Dit tijdstip bestaat niet door de overgang naar zomertijd. Kies een ander tijdstip.' };
  return { ok: true, date: new Date(utc) };
}

const fmtDateTime = new Intl.DateTimeFormat('nl-NL', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtDate = new Intl.DateTimeFormat('nl-NL', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtTime = new Intl.DateTimeFormat('nl-NL', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });

export const formatDateTime = (d: Date | string) => fmtDateTime.format(new Date(d));
export const formatDate = (d: Date | string) => fmtDate.format(new Date(d));
export const formatTime = (d: Date | string) => fmtTime.format(new Date(d));

/** Lokale datum/tijd-strings voor invoervelden. */
export function toLocalInput(d: Date | string) {
  const p = amsParts(new Date(d));
  const z = (n: number) => String(n).padStart(2, '0');
  return { date: `${p.y}-${z(p.m)}-${z(p.d)}`, time: `${z(p.h)}:${z(p.mi)}` };
}

export function formatRelative(target: Date | string, now = new Date()) {
  const ms = new Date(target).getTime() - now.getTime();
  if (ms <= 0) return 'verlopen';
  const min = Math.round(ms / 60000);
  if (min < 60) return `nog ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `nog ${h} uur${min % 60 ? ` ${min % 60} min` : ''}`;
  return `nog ${Math.floor(h / 24)} dagen`;
}

export const hours = (n: number) => n * 3600_000;
export const minutes = (n: number) => n * 60_000;
