import type { Evento } from './types.ts';

export const NOMI_EVENTO: Record<string, string> = {
  arrivata: 'Arrivata dal fornitore',
  interna: 'Aggiunta (cavalletta interna)',
  imballata: 'Imballata: piena di serramenti',
  consegnata: 'Consegnata al cliente',
  rientrata: 'Rientrata, vuota',
  non_usata: 'Segnata vuota: non usata in produzione',
  restituita: 'Restituita alla vetreria',
  correzione: 'Correzione manuale',
};

export function descriviEvento(e: Pick<Evento, 'tipo' | 'dettaglio'>): string {
  const d = e.dettaglio as Record<string, unknown>;
  if (e.tipo === 'correzione') {
    const cambi = (d.cambi ?? {}) as Record<string, { da: unknown; a: unknown }>;
    return Object.entries(cambi)
      .map(([k, v]) => `${k}: ${String(v.da ?? '–')} → ${String(v.a ?? '–')}`)
      .join(' · ');
  }
  const parti: string[] = [];
  if (d.commessa) parti.push(`commessa ${String(d.commessa)}`);
  if (d.cliente) parti.push(String(d.cliente));
  if (d.ddt) parti.push(`DDT ${String(d.ddt)}`);
  if (d.contenuto) parti.push(String(d.contenuto));
  return parti.join(' · ');
}
