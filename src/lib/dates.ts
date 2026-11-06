// Date come stringhe "YYYY-MM-DD", calcolate in UTC per evitare problemi di fuso orario.

const MS_GIORNO = 86_400_000;

export function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  return toIso(new Date(parseIso(iso).getTime() + n * MS_GIORNO));
}

/** giorni di calendario da a a b (b - a) */
export function diffDays(a: string, b: string): number {
  return Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / MS_GIORNO);
}

/** La data di oggi in Italia, comunque sia impostato il computer */
export function oggiRoma(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function formattaData(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** Domenica di Pasqua (algoritmo gregoriano) */
export function pasqua(anno: number): string {
  const a = anno % 19;
  const b = Math.floor(anno / 100);
  const c = anno % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mese = Math.floor((h + l - 7 * m + 114) / 31);
  const giorno = ((h + l - 7 * m + 114) % 31) + 1;
  return `${anno}-${String(mese).padStart(2, '0')}-${String(giorno).padStart(2, '0')}`;
}

/** Festività nazionali italiane (incluso Lunedì dell'Angelo) */
export function festivi(anno: number): Set<string> {
  const fissi = ['01-01', '01-06', '04-25', '05-01', '06-02', '08-15', '11-01', '12-08', '12-25', '12-26'];
  const set = new Set(fissi.map((f) => `${anno}-${f}`));
  set.add(addDays(pasqua(anno), 1));
  return set;
}

/** Lavorativo = lun-ven, non festivo, non in `extra` (chiusure aziendali) */
export function isLavorativo(iso: string, extra: ReadonlySet<string> = new Set()): boolean {
  const dow = parseIso(iso).getUTCDay();
  if (dow === 0 || dow === 6) return false;
  if (extra.has(iso)) return false;
  return !festivi(Number(iso.slice(0, 4))).has(iso);
}

/** Giorni lavorativi trascorsi dopo `start`, fino a `end` incluso (start escluso). */
export function giorniLavorativiTra(start: string, end: string, extra: ReadonlySet<string> = new Set()): number {
  if (end <= start) return 0;
  let n = 0;
  let cur = start;
  while (cur < end) {
    cur = addDays(cur, 1);
    if (isLavorativo(cur, extra)) n++;
  }
  return n;
}

/** La data in cui scatta l'N-esimo giorno lavorativo dopo `start` */
export function aggiungiGiorniLavorativi(start: string, n: number, extra: ReadonlySet<string> = new Set()): string {
  let cur = start;
  let fatti = 0;
  while (fatti < n) {
    cur = addDays(cur, 1);
    if (isLavorativo(cur, extra)) fatti++;
  }
  return cur;
}
