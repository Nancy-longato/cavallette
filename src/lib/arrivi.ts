// Arrivi dei vetri: Excel "generico" di Nicole. Cerca le colonne dal nome dell'intestazione,
// quindi funziona con layout diversi purché ci sia una colonna con "cavalletta/cavalletti".

import type { Vetreria } from './types.ts';
import type { Foglio } from './xlsxReader.ts';
import { cellaInTesto } from './xlsxReader.ts';
import { spezzaCavallette } from './keys.ts';

export interface RigaArrivo {
  codice: string;
  vetreria: string | null;
  contenuto: string;
}

function norm(s: string): string {
  return s
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function riconosciVetreria(testo: string, vetrerie: Vetreria[]): string | null {
  const t = norm(testo);
  if (!t) return null;
  const perCodice = vetrerie.find((v) => norm(v.codice) === t);
  if (perCodice) return perCodice.codice;
  const perNome = vetrerie.find((v) => t.includes(norm(v.nome)) || norm(v.nome).includes(t));
  return perNome ? perNome.codice : null;
}

export function leggiArriviExcel(fogli: Foglio[], vetrerie: Vetreria[]): { righe: RigaArrivo[]; avvisi: string[] } {
  const avvisi: string[] = [];
  for (const foglio of fogli) {
    const iInt = foglio.righe.findIndex((r, i) => i < 20 && r.some((c) => norm(cellaInTesto(c)).includes('CAVALLETT')));
    if (iInt < 0) continue;
    const intest = foglio.righe[iInt].map((c) => norm(cellaInTesto(c)));
    const colCav = intest.findIndex((h) => h.includes('CAVALLETT'));
    const colVet = intest.findIndex((h) => h.includes('VETRERIA') || h.includes('FORNITORE'));
    const colCont = intest.findIndex((h) => h.includes('CONTENUT') || h.includes('DESCRIZ') || h.includes('VETRI') || h.includes('MATERIALE'));

    const righe: RigaArrivo[] = [];
    for (const r of foglio.righe.slice(iInt + 1)) {
      const codici = spezzaCavallette(cellaInTesto(r[colCav]));
      if (!codici.length) continue;
      const vetreria = colVet >= 0 ? riconosciVetreria(cellaInTesto(r[colVet]), vetrerie) : null;
      const contenuto = colCont >= 0 && colCont !== colCav ? cellaInTesto(r[colCont]) : '';
      for (const codice of codici) righe.push({ codice, vetreria, contenuto });
    }
    if (colVet < 0) avvisi.push('Nel file non c\'è una colonna vetreria/fornitore: scegli la vetreria qui sotto.');
    if (!righe.length) avvisi.push('Nessuna cavalletta trovata sotto l\'intestazione.');
    return { righe, avvisi };
  }
  return { righe: [], avvisi: ['Non ho trovato una colonna "cavalletta/cavalletti" nel file.'] };
}
