import type { Cavalletta } from './types.ts';
import { LONGATO } from './types.ts';
import { diffDays, giorniLavorativiTra } from './dates.ts';

/** Giorni lavorativi da quando la cavalletta è dal cliente (null se non è dal cliente) */
export function giorniInCantiere(c: Cavalletta, oggi: string, chiusure: ReadonlySet<string>): number | null {
  if (c.luogo !== 'cliente' || !c.data_consegna) return null;
  return giorniLavorativiTra(c.data_consegna, oggi, chiusure);
}

/** Dal cliente da almeno `soglia` giorni lavorativi: presumibilmente vuota, da andare a ritirare */
export function daRitirare(c: Cavalletta, oggi: string, chiusure: ReadonlySet<string>, soglia: number): boolean {
  const g = giorniInCantiere(c, oggi, chiusure);
  return g !== null && g >= soglia;
}

/** Giorni di calendario da quando la cavalletta del fornitore è in sede (null per le nostre) */
export function giacenza(c: Cavalletta, oggi: string): number | null {
  if (c.vetreria === LONGATO || !c.data_arrivo) return null;
  return Math.max(0, diffDays(c.data_arrivo, oggi));
}

export function etichettaStato(c: Cavalletta, inAllerta: boolean): string {
  if (inAllerta) return 'Vuota (da ritirare)';
  if (c.stato === 'piena_vetri') return 'Piena (vetri)';
  if (c.stato === 'piena_serramenti') return 'Piena (serramenti)';
  return 'Vuota';
}

export function etichettaLuogo(c: Cavalletta): string {
  return c.luogo === 'cliente' ? 'Dal cliente' : 'Piazzale';
}

import { nomeProvincia } from './province.ts';

export const SENZA_PROVINCIA = 'Provincia non indicata';

/**
 * Provincia dall'indirizzo, scritta tra parentesi in fondo: "VIA ROMA 22, CASTELFRANCO VENETO (TREVISO)" -> "Treviso".
 * Sigle e nomi si uniscono: "(VE)", "(Ve)" e "(VENEZIA)" -> "Venezia".
 */
export function provinciaDa(indirizzo: string | null | undefined): string {
  const m = /\(([^()]+)\)\s*$/.exec(indirizzo ?? '');
  const t = m ? m[1].trim().replace(/\s+/g, ' ') : '';
  if (!t) return SENZA_PROVINCIA;
  const nome = nomeProvincia(t);
  if (nome) return nome;
  if (t.length <= 2) return t.toUpperCase();
  return t.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (x) => x.toUpperCase());
}
