// Lettore .xlsx minimale (solo lettura valori) basato su jszip.
// Gestisce quanto serve per l'export di Smartsheet e per i file Excel di Nicole:
// stringhe condivise, numeri, booleani, date (riconosciute dal formato della cella).

import JSZip from 'jszip';

export type Cella = string | number | boolean | Date | null;
export interface Foglio {
  nome: string;
  righe: Cella[][];
}

function decodificaXml(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_m, e: string) => {
    switch (e) {
      case 'amp':
        return '&';
      case 'lt':
        return '<';
      case 'gt':
        return '>';
      case 'quot':
        return '"';
      case 'apos':
        return "'";
      default: {
        const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : '';
      }
    }
  });
}

function attributo(attrs: string, nome: string): string | undefined {
  const m = new RegExp(`(?:^|\\s)${nome}="([^"]*)"`).exec(attrs);
  return m ? decodificaXml(m[1]) : undefined;
}

function indiceColonna(lettere: string): number {
  let n = 0;
  for (const ch of lettere) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function testoDi(xml: string): string {
  const senzaFonetica = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let out = '';
  const re = /<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(senzaFonetica))) out += m[1] ? decodificaXml(m[1]) : '';
  return out;
}

function leggiStringheCondivise(xml: string | undefined): string[] {
  if (!xml) return [];
  const out: string[] = [];
  const re = /<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1] ? testoDi(m[1]) : '');
  return out;
}

const FORMATI_DATA_INTEGRATI = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

function formatoEData(codice: string): boolean {
  const pulito = codice.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '');
  return /[dmyhs]/i.test(pulito);
}

function leggiStiliData(xml: string | undefined): boolean[] {
  if (!xml) return [];
  const custom = new Map<number, string>();
  const reFmt = /<numFmt\b([^>]*?)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = reFmt.exec(xml))) {
    const id = attributo(m[1], 'numFmtId');
    const code = attributo(m[1], 'formatCode');
    if (id !== undefined && code !== undefined) custom.set(Number(id), code);
  }
  const blocco = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml);
  if (!blocco) return [];
  const out: boolean[] = [];
  const reXf = /<xf\b([^>]*?)(?:\/>|>)/g;
  while ((m = reXf.exec(blocco[1]))) {
    const id = Number(attributo(m[1], 'numFmtId') ?? '0');
    out.push(FORMATI_DATA_INTEGRATI.has(id) || (custom.has(id) && formatoEData(custom.get(id)!)));
  }
  return out;
}

function serialeInData(seriale: number, sistema1904: boolean): Date {
  const offset = sistema1904 ? 24107 : 25569;
  return new Date(Math.round((seriale - offset) * 86_400_000));
}

function leggiFoglio(xml: string, stringhe: string[], stiliData: boolean[], sistema1904: boolean): Cella[][] {
  const righe: Cella[][] = [];
  const reCella = /<c\b([^>]*?)\/>|<c\b([^>]*)>([\s\S]*?)<\/c>/g;
  let m: RegExpExecArray | null;
  while ((m = reCella.exec(xml))) {
    if (m[2] === undefined) continue; // cella vuota "<c .../>"
    const attrs = m[2];
    const interno = m[3] ?? '';
    const rif = attributo(attrs, 'r');
    if (!rif) continue;
    const rm = /^([A-Z]+)(\d+)$/.exec(rif);
    if (!rm) continue;
    const col = indiceColonna(rm[1]);
    const riga = Number(rm[2]) - 1;
    const tipo = attributo(attrs, 't');
    const stile = Number(attributo(attrs, 's') ?? '0');
    const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(interno)?.[1];
    let valore: Cella = null;
    if (tipo === 'inlineStr') {
      valore = testoDi(/<is\b[^>]*>([\s\S]*?)<\/is>/.exec(interno)?.[1] ?? '');
    } else if (v !== undefined) {
      if (tipo === 's') valore = stringhe[Number(v)] ?? '';
      else if (tipo === 'str') valore = decodificaXml(v);
      else if (tipo === 'b') valore = v === '1';
      else if (tipo === 'e') valore = null;
      else {
        const n = Number(v);
        valore = Number.isFinite(n) ? (stiliData[stile] ? serialeInData(n, sistema1904) : n) : decodificaXml(v);
      }
    }
    if (valore === null || valore === '') continue;
    while (righe.length <= riga) righe.push([]);
    const r = righe[riga];
    while (r.length <= col) r.push(null);
    r[col] = valore;
  }
  for (let i = 0; i < righe.length; i++) if (!righe[i]) righe[i] = [];
  return righe;
}

export async function leggiXlsx(dati: ArrayBuffer | Uint8Array): Promise<Foglio[]> {
  const zip = await JSZip.loadAsync(dati);
  const testo = async (percorso: string): Promise<string | undefined> => zip.file(percorso)?.async('string');

  const workbook = await testo('xl/workbook.xml');
  if (!workbook) throw new Error('File non valido: non sembra un .xlsx');
  const rels = (await testo('xl/_rels/workbook.xml.rels')) ?? '';
  const stringhe = leggiStringheCondivise(await testo('xl/sharedStrings.xml'));
  const stiliData = leggiStiliData(await testo('xl/styles.xml'));
  const sistema1904 = /<workbookPr\b[^>]*date1904="(true|1)"/.test(workbook);

  const destinazioni = new Map<string, string>();
  const reRel = /<Relationship\b([^>]*?)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = reRel.exec(rels))) {
    const id = attributo(m[1], 'Id');
    const target = attributo(m[1], 'Target');
    if (id && target) destinazioni.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target}`);
  }

  const fogli: Foglio[] = [];
  const reSheet = /<sheet\b([^>]*?)\/?>/g;
  while ((m = reSheet.exec(workbook))) {
    const nome = attributo(m[1], 'name') ?? 'Foglio';
    const rid = attributo(m[1], 'r:id');
    const percorso = rid ? destinazioni.get(rid) : undefined;
    const xml = percorso ? await testo(percorso) : undefined;
    if (!xml) continue;
    fogli.push({ nome, righe: leggiFoglio(xml, stringhe, stiliData, sistema1904) });
  }
  return fogli;
}

/** Valore della cella come testo "pulito" (le date diventano dd/mm/yyyy) */
export function cellaInTesto(c: Cella | undefined): string {
  if (c === null || c === undefined) return '';
  if (c instanceof Date) {
    const iso = c.toISOString().slice(0, 10);
    return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  }
  if (typeof c === 'number') return String(c);
  return String(c).trim();
}
