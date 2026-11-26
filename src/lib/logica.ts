import type { Cavalletta } from './types.ts';
import { LONGATO } from './types.ts';
import { diffDays } from './dates.ts';

/** Giorni di calendario da quando la cavalletta del fornitore è in sede (null per le nostre) */
export function giacenza(c: Cavalletta, oggi: string): number | null {
  if (c.vetreria === LONGATO || !c.data_arrivo) return null;
  return Math.max(0, diffDays(c.data_arrivo, oggi));
}

/** Gli unici tre stati: Vuota, Piena (vetri), Piena (serramenti) */
export function etichettaStato(c: Cavalletta): string {
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

/** Giorni (di calendario) da quando la cavalletta è nello stato attuale; null se non si sa */
export function giorniNelloStato(c: Cavalletta, oggi: string): number | null {
  if (!c.stato_dal) return null;
  return Math.max(0, diffDays(c.stato_dal, oggi));
}

/** "da oggi", "da 1 giorno", "da 12 giorni" */
export function testoDa(giorni: number | null): string {
  if (giorni === null) return '';
  if (giorni === 0) return 'da oggi';
  if (giorni === 1) return 'da 1 giorno';
  return `da ${giorni} giorni`;
}

/** Commessa e cliente si vedono solo quando la cavalletta è pronta (piena di serramenti) */
export function pronta(c: Cavalletta): boolean {
  return c.stato === 'piena_serramenti';
}
