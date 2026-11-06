// Lettura dei DDT dei fornitori (PDF). Il parser lavora su "pezzi di testo con coordinate",
// quindi è indipendente dalla libreria che apre il PDF (e testabile senza browser).
//
// Formato Pescini (verificato su DDT 3873): i cavalletti stanno in fondo all'ultima pagina,
// nel riquadro "Cavalletti Consegnati | Cavalletti Ritirati", sotto le rispettive etichette.

export interface PdfItem {
  str: string;
  x: number;
  y: number;
}

export interface DdtRisultato {
  vetreria: string | null; // codice: P, F, B, PG
  numeroDdt: string | null;
  dataDdt: string | null; // YYYY-MM-DD
  ordini: string[]; // es. "26323 GURAU MARIANA"
  consegnati: string[]; // codici cavalletta come stampati sul DDT
  ritirati: string[];
  avvisi: string[];
}

interface PdfDocLike {
  numPages: number;
  getPage(n: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }> }>;
}

/** Converte un documento pdf.js in pagine di PdfItem */
export async function estraiPagine(doc: PdfDocLike): Promise<PdfItem[][]> {
  const pagine: PdfItem[][] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const contenuto = await page.getTextContent();
    const items: PdfItem[] = [];
    for (const it of contenuto.items) {
      const t = it as { str?: unknown; transform?: unknown };
      if (typeof t.str === 'string' && t.str.trim() && Array.isArray(t.transform)) {
        items.push({ str: t.str, x: Number(t.transform[4]), y: Number(t.transform[5]) });
      }
    }
    pagine.push(items);
  }
  return pagine;
}

interface Riga {
  y: number;
  items: PdfItem[];
  testo: string;
}

function righeDi(items: PdfItem[]): Riga[] {
  const ordinati = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const righe: Riga[] = [];
  let corrente: Riga | null = null;
  for (const it of ordinati) {
    if (!corrente || Math.abs(corrente.y - it.y) > 2.5) {
      corrente = { y: it.y, items: [it], testo: '' };
      righe.push(corrente);
    } else {
      corrente.items.push(it);
    }
  }
  for (const r of righe) {
    r.items.sort((a, b) => a.x - b.x);
    r.testo = r.items.map((i) => i.str.trim()).join(' ').replace(/\s+/g, ' ').trim();
  }
  return righe;
}

const VETRERIE: { codice: string; re: RegExp }[] = [
  { codice: 'P', re: /pescini/i },
  { codice: 'F', re: /\bfeca\b/i },
  { codice: 'B', re: /bizzotto/i },
  { codice: 'PG', re: /press\s*glass/i },
];

function dataIso(s: string): string | null {
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s);
  if (!m) return null;
  const anno = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return `${anno}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/** Posizione (x, y) dell'inizio di una frase, anche se spezzata su due pezzi di testo */
function trovaEtichetta(righe: Riga[], frase: RegExp, parole: [RegExp, RegExp]): { x: number; y: number } | null {
  for (const r of righe) {
    for (let i = 0; i < r.items.length; i++) {
      if (frase.test(r.items[i].str)) return { x: r.items[i].x, y: r.items[i].y };
      const succ = r.items[i + 1];
      if (succ && parole[0].test(r.items[i].str.trim()) && parole[1].test(succ.str.trim())) {
        return { x: r.items[i].x, y: r.items[i].y };
      }
    }
  }
  return null;
}

function tokensCavalletta(testo: string): string[] {
  return testo
    .split(/\s+/)
    .map((t) => t.trim().toUpperCase())
    .filter((t) => /^[A-Z0-9]{2,8}$/.test(t) && /\d/.test(t));
}

export function parseDdt(pagine: PdfItem[][]): DdtRisultato {
  const avvisi: string[] = [];
  const righePerPagina = pagine.map(righeDi);
  const tutte = righePerPagina.flat();
  const testoTotale = tutte.map((r) => r.testo).join('\n');

  // Vetreria: l'intestazione del fornitore compare per prima (la destinataria, Longato, non è nell'elenco)
  let vetreria: string | null = null;
  let migliore = Infinity;
  for (const v of VETRERIE) {
    const idx = testoTotale.search(v.re);
    if (idx >= 0 && idx < migliore) {
      migliore = idx;
      vetreria = v.codice;
    }
  }
  if (!vetreria) avvisi.push('Vetreria non riconosciuta dal PDF: scegli tu la vetreria.');

  // Numero e data del documento
  let numeroDdt: string | null = null;
  let dataDdt: string | null = null;
  const prima = righePerPagina[0] ?? [];
  const idxIntest = prima.findIndex((r) => /Num\.?\s*Doc/i.test(r.testo));
  if (idxIntest >= 0) {
    for (const r of prima.slice(idxIntest + 1, idxIntest + 4)) {
      const m = /^([A-Za-z0-9/-]+)\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\b/.exec(r.testo);
      if (m) {
        numeroDdt = m[1];
        dataDdt = dataIso(m[2]);
        break;
      }
    }
  }
  if (!dataDdt) dataDdt = dataIso(testoTotale);
  if (!numeroDdt) avvisi.push('Numero DDT non trovato nel PDF.');

  // Ordini dei clienti (contenuto dei vetri)
  const ordini: string[] = [];
  for (const r of tutte) {
    const m = /^VS\s+ORDINE:?\s*(.+)$/i.exec(r.testo);
    if (m) {
      const o = m[1].trim();
      if (o && !ordini.includes(o)) ordini.push(o);
    }
  }

  // Cavalletti: sotto le etichette del riquadro, divisi per colonna
  const consegnati: string[] = [];
  const ritirati: string[] = [];
  let riquadroTrovato = false;
  pagine.forEach((items, i) => {
    const righe = righePerPagina[i];
    const cons = trovaEtichetta(righe, /Cavalletti\s+Consegnati/i, [/^Cavalletti$/i, /^Consegnati$/i]);
    if (!cons) return;
    riquadroTrovato = true;
    const rit = trovaEtichetta(righe, /Cavalletti\s+Ritirati/i, [/^Cavalletti$/i, /^Ritirati$/i]);
    const fine = trovaEtichetta(righe, /Firma\s+del\s+conducente/i, [/^Firma$/i, /^del$/i]);
    const xRit = rit ? rit.x : Infinity;
    const xFine = fine ? fine.x : Infinity;
    for (const it of items) {
      const dy = cons.y - it.y;
      if (dy <= 1 || dy > 32) continue;
      const tokens = tokensCavalletta(it.str);
      if (!tokens.length) continue;
      if (it.x >= cons.x - 6 && it.x < xRit - 6) {
        for (const t of tokens) if (!consegnati.includes(t)) consegnati.push(t);
      } else if (it.x >= xRit - 6 && it.x < xFine - 6) {
        for (const t of tokens) if (!ritirati.includes(t)) ritirati.push(t);
      }
    }
  });
  if (!riquadroTrovato) {
    avvisi.push('Riquadro "Cavalletti Consegnati" non trovato: aggiungi i codici a mano.');
  } else if (!consegnati.length) {
    avvisi.push('Nessun cavalletto consegnato trovato nel DDT: controlla il PDF o aggiungi i codici a mano.');
  }

  return { vetreria, numeroDdt, dataDdt, ordini, consegnati, ritirati, avvisi };
}
