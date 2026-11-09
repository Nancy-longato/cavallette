// Tutte le chiamate al database. La sicurezza vera è nelle regole RLS di supabase/schema.sql:
// qui non si decide chi può fare cosa, si chiede e basta.

import { supabase } from './supabase.ts';
import type { Anomalia, Cavalletta, Ciclo, Evento, Profilo, Restituzione, Ruolo, Vetreria } from './types.ts';
import type { Piano } from './smartsheet.ts';
import { oggiRoma } from './dates.ts';

/** Come ok(), ma segnala se la scrittura non ha toccato nessuna riga (le regole di accesso lo fanno in silenzio). */
function okTocca(res: { data: unknown[] | null; error: { message: string } | null }, cosa: string): void {
  if (res.error) throw new Error(res.error.message);
  if (!res.data || res.data.length === 0) throw new Error(`${cosa}: nessuna modifica effettuata (permessi insufficienti o dato non più presente).`);
}

function ok<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/** Legge tutte le righe anche oltre il limite di 1000 di Supabase */
async function leggiTutto<T>(costruisci: (da: number, a: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const tutte: T[] = [];
  for (let da = 0; ; da += 1000) {
    const pezzo = ok(await costruisci(da, da + 999)) ?? [];
    tutte.push(...pezzo);
    if (pezzo.length < 1000) break;
  }
  return tutte;
}

// ---------- lettura ----------
export async function caricaVetrerie(): Promise<Vetreria[]> {
  return ok(await supabase.from('vetrerie').select('*').order('ordine')) ?? [];
}

export async function caricaCavallette(): Promise<Cavalletta[]> {
  return leggiTutto<Cavalletta>((da, a) =>
    supabase.from('cavallette').select('*').eq('restituita', false).order('numero').range(da, a),
  );
}

export async function caricaCicli(): Promise<Ciclo[]> {
  return leggiTutto<Ciclo>((da, a) => supabase.from('cicli').select('*').order('creato_il').range(da, a));
}

export async function caricaImpostazioni(): Promise<{ soglia: number; chiusure: string[] }> {
  const imp = ok(await supabase.from('impostazioni').select('chiave, valore')) ?? [];
  const soglia = Number(imp.find((i) => i.chiave === 'giorni_alert')?.valore ?? '10');
  const ch = ok(await supabase.from('chiusure').select('data').order('data')) ?? [];
  return { soglia: Number.isFinite(soglia) && soglia > 0 ? soglia : 10, chiusure: ch.map((c) => c.data as string) };
}

export async function caricaAnomalie(): Promise<Anomalia[]> {
  return ok(await supabase.from('anomalie').select('*').order('creata_il', { ascending: false }).limit(500)) ?? [];
}

export async function caricaEventi(cavallettaId: string): Promise<Evento[]> {
  return ok(await supabase.from('eventi').select('*').eq('cavalletta_id', cavallettaId).order('creato_il', { ascending: false })) ?? [];
}

export async function caricaRestituzioni(): Promise<{ restituzione: Restituzione; cavallette: Cavalletta[] }[]> {
  const rest = ok(await supabase.from('restituzioni').select('*').order('creata_il', { ascending: false }).limit(200)) ?? [];
  if (!rest.length) return [];
  const cav = ok(
    await supabase.from('cavallette').select('*').in('restituzione_id', rest.map((r) => r.id)).order('numero'),
  ) as Cavalletta[] | null;
  return (rest as Restituzione[]).map((r) => ({ restituzione: r, cavallette: (cav ?? []).filter((c) => c.restituzione_id === r.id) }));
}

export async function caricaProfili(): Promise<Profilo[]> {
  return ok(await supabase.from('profili').select('*').order('email')) ?? [];
}

// ---------- scritture ----------
export interface NuovaCavalletta {
  numero: string;
  vetreria: string;
  etichetta: string | null;
  contenuto: string | null;
  data_arrivo: string | null;
  ddt_arrivo: string | null;
  stato: 'piena_vetri' | 'vuota';
}

/** Inserisce nuove cavallette (arrivi dai fornitori o cavallette interne) e chiude le segnalazioni "sconosciuta" */
export async function salvaNuoveCavallette(nuove: NuovaCavalletta[], tipoEvento: string): Promise<number> {
  if (!nuove.length) return 0;
  const inserite = ok(
    await supabase
      .from('cavallette')
      .insert(nuove.map((n) => ({ ...n, luogo: 'piazzale' })))
      .select('id, numero'),
  ) ?? [];
  ok(
    await supabase.from('eventi').insert(
      inserite.map((c) => {
        const n = nuove.find((x) => x.numero === c.numero);
        return { cavalletta_id: c.id, tipo: tipoEvento, dettaglio: { vetreria: n?.vetreria, ddt: n?.ddt_arrivo ?? null, contenuto: n?.contenuto ?? null } };
      }),
    ),
  );
  const numeri = nuove.map((n) => n.numero);
  await supabase
    .from('anomalie')
    .update({ risolta: true, risolta_il: new Date().toISOString() })
    .eq('tipo', 'sconosciuta')
    .eq('risolta', false)
    .in('numero', numeri);
  return inserite.length;
}

/** Applica il piano dell'import Smartsheet. Rieseguibile: i passaggi sono tutti "idempotenti". */
export async function applicaPiano(piano: Piano): Promise<void> {
  // 1) cavallette: una sola scrittura per cavalletta (patch unite nell'ordine)
  const patchPerId = new Map<string, Partial<Cavalletta>>();
  for (const a of piano.azioni) patchPerId.set(a.cavallettaId, { ...(patchPerId.get(a.cavallettaId) ?? {}), ...a.patch });
  const ids = [...patchPerId.keys()];
  for (let i = 0; i < ids.length; i += 10) {
    await Promise.all(
      ids.slice(i, i + 10).map(async (id) => {
        okTocca(await supabase.from('cavallette').update(patchPerId.get(id)!).eq('id', id).select('id'), 'Aggiornamento cavalletta');
      }),
    );
  }
  // 2) storico eventi
  if (piano.azioni.length) {
    ok(
      await supabase.from('eventi').insert(
        piano.azioni.map((a) => ({
          cavalletta_id: a.cavallettaId,
          tipo: a.tipo,
          dettaglio: { commessa: a.commessa, cliente: a.cliente, fonte: 'smartsheet' },
        })),
      ),
    );
  }
  // 3) cicli
  if (piano.cicli.length) {
    ok(await supabase.from('cicli').upsert(piano.cicli.map(({ id: _id, ...c }) => c), { onConflict: 'cavalletta_id,commessa' }));
  }
  // 4) segnalazioni nuove (senza duplicare quelle già aperte)
  if (piano.anomalie.length) {
    const aperte = ok(await supabase.from('anomalie').select('tipo, numero, commessa').eq('risolta', false)) ?? [];
    const gia = new Set(aperte.map((a) => `${a.tipo}|${a.numero}|${a.commessa}`));
    const nuove = piano.anomalie.filter((a) => !gia.has(`${a.tipo}|${a.numero}|${a.commessa}`));
    if (nuove.length) ok(await supabase.from('anomalie').insert(nuove));
  }
  // 5) segnalazioni ora risolte
  for (const r of piano.risolte) {
    await supabase
      .from('anomalie')
      .update({ risolta: true, risolta_il: new Date().toISOString() })
      .eq('risolta', false)
      .eq('numero', r.numero)
      .eq('commessa', r.commessa);
  }
}

/**
 * Cavallette arrivate con i vetri e non usate in produzione: diventano vuote (pronte da restituire)
 * e si crea una segnalazione per la logistica. Si chiude da sola alla restituzione.
 */
export async function segnaNonUsate(cavallette: Cavalletta[], nomeVetreria: (codice: string) => string): Promise<number> {
  if (!cavallette.length) return 0;
  const patch = { stato: 'vuota' as const, contenuto: null };
  for (let i = 0; i < cavallette.length; i += 10) {
    await Promise.all(
      cavallette.slice(i, i + 10).map(async (c) => {
        okTocca(await supabase.from('cavallette').update(patch).eq('id', c.id).eq('stato', 'piena_vetri').select('id'), `Cavalletta ${c.numero}`);
      }),
    );
  }
  ok(
    await supabase.from('eventi').insert(
      cavallette.map((c) => ({ cavalletta_id: c.id, tipo: 'non_usata', dettaglio: { vetreria: c.vetreria, contenuto_precedente: c.contenuto } })),
    ),
  );
  const aperte = ok(await supabase.from('anomalie').select('tipo, numero, commessa').eq('risolta', false).eq('tipo', 'non_usata')) ?? [];
  const gia = new Set(aperte.map((a) => a.numero));
  const nuove = cavallette
    .filter((c) => !gia.has(c.numero))
    .map((c) => ({
      tipo: 'non_usata',
      numero: c.numero,
      commessa: '',
      dettaglio: `La cavalletta ${c.numero} (${nomeVetreria(c.vetreria)}) è arrivata con i vetri ma non è stata usata in produzione: è vuota in piazzale, pronta da riportare alla vetreria.`,
    }));
  if (nuove.length) ok(await supabase.from('anomalie').insert(nuove));
  return cavallette.length;
}

export async function risolviAnomalia(id: number, risolta: boolean): Promise<void> {
  okTocca(
    await supabase
      .from('anomalie')
      .update({ risolta, risolta_il: risolta ? new Date().toISOString() : null })
      .eq('id', id)
      .select('id'),
    'Segnalazione',
  );
}

/** Correzione manuale (solo admin): registra cosa è cambiato */
export async function correggiCavalletta(prima: Cavalletta, patch: Partial<Cavalletta>): Promise<void> {
  okTocca(await supabase.from('cavallette').update(patch).eq('id', prima.id).select('id'), 'Correzione');
  const cambi: Record<string, { da: unknown; a: unknown }> = {};
  for (const [k, v] of Object.entries(patch)) {
    const vecchio = (prima as unknown as Record<string, unknown>)[k];
    if (vecchio !== v) cambi[k] = { da: vecchio, a: v };
  }
  ok(await supabase.from('eventi').insert({ cavalletta_id: prima.id, tipo: 'correzione', dettaglio: { cambi } }));
}

export async function eliminaCavalletta(id: string): Promise<void> {
  okTocca(await supabase.from('cavallette').delete().eq('id', id).select('id'), 'Eliminazione');
}

export async function restituisci(vetreria: string, ids: string[]): Promise<void> {
  ok(await supabase.rpc('restituisci_cavallette', { p_vetreria: vetreria, p_ids: ids }));
}

export async function cambiaRuolo(id: string, ruolo: Ruolo): Promise<void> {
  okTocca(await supabase.from('profili').update({ ruolo }).eq('id', id).select('id'), 'Cambio ruolo');
}

export async function salvaSoglia(giorni: number): Promise<void> {
  ok(await supabase.from('impostazioni').upsert({ chiave: 'giorni_alert', valore: String(giorni) }).select());
}

export async function aggiungiChiusura(data: string, descrizione: string): Promise<void> {
  ok(await supabase.from('chiusure').upsert({ data, descrizione: descrizione || null }).select());
}

export async function eliminaChiusura(data: string): Promise<void> {
  ok(await supabase.from('chiusure').delete().eq('data', data).select());
}

export { oggiRoma };
