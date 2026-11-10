// Import dall'Excel di Smartsheet: legge le righe delle commesse e calcola COSA cambia
// nelle cavallette. Non scrive nulla: restituisce un "piano" che l'utente controlla e applica.
//
// Regole (ogni coppia cavalletta+commessa ha una "fase" che può solo avanzare):
//   fase 1  IMBALLO spuntato          -> Piazzale, Piena (serramenti), commessa/cliente/indirizzo
//   fase 2  DDT CONS. RIENTRATO       -> Dal cliente (+ indirizzo), data da DATA CONS. RIENTRATO
//   fase 3  DDT RIENTRO CAVALLETTA    -> Piazzale, Vuota, commessa/cliente/indirizzo svuotati
// Rieseguire lo stesso file non cambia nulla; le correzioni manuali non vengono sovrascritte.

import type { Cavalletta, Ciclo } from './types.ts';
import type { Cella, Foglio } from './xlsxReader.ts';
import { cellaInTesto } from './xlsxReader.ts';
import { spezzaCavallette, trovaNumero } from './keys.ts';
import { toIso } from './dates.ts';

export interface RigaSmartsheet {
  commessa: string;
  cliente: string | null;
  indirizzo: string | null;
  imballo: boolean;
  cavallette: string; // testo grezzo della colonna NUMERO CAVALLETTE
  ddtCons: boolean;
  ddtRientro: boolean;
  dataCons: string | null; // YYYY-MM-DD: colonna «DATA CONS. RIENTRATO» (o data scritta nella colonna della spunta)
  dataRientro: string | null; // YYYY-MM-DD: colonna «DAT DDT RIENTRO CAVALLETTA»
}

export interface LetturaSmartsheet {
  righe: RigaSmartsheet[];
  colonneMancanti: string[];
  haDataCons: boolean;
  foglio: string;
}

function normIntestazione(s: string): string {
  return s
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

const ALIAS = {
  commessa: ['COMMESSA'],
  cliente: ['CLIENTE'],
  indirizzo: ['INDIRIZZO CANTIERE', 'INDIRIZZO'],
  paese: ['PAESE'],
  provincia: ['PROVINCIA'],
  imballo: ['IMBALLO', 'IMBALLAGGIO'],
  cavallette: ['NUMERO CAVALLETTE', 'N CAVALLETTE', 'CAVALLETTE', 'NUMERO CAVALLETTA'],
  ddtCons: ['DDT CONS RIENTRATO', 'DDT CONSEGNA RIENTRATO'],
  ddtRientro: ['DDT RIENTRO', 'DDT RIENTRO CAVALLETTA', 'DDT RIENTRO CAVALLETTE'],
  dataCons: ['DATA CONS RIENTRATO', 'DATA CONSEGNA RIENTRATO', 'DATA DDT CONS RIENTRATO'],
  dataRientro: ['DAT DDT RIENTRO CAVALLETTA', 'DATA DDT RIENTRO CAVALLETTA', 'DATA RIENTRO CAVALLETTA', 'DATA DDT RIENTRO', 'DATA RIENTRO'],
} as const;

type Campo = keyof typeof ALIAS;
const OBBLIGATORI: { campo: Campo; nome: string }[] = [
  { campo: 'commessa', nome: 'COMMESSA' },
  { campo: 'imballo', nome: 'IMBALLAGGIO' },
  { campo: 'cavallette', nome: 'N° CAVALLETTE' },
  { campo: 'ddtCons', nome: 'DDT CONS. RIENTRATO' },
  { campo: 'ddtRientro', nome: 'DDT RIENTRO CAVALLETTA' },
];

export function aBooleano(c: Cella | undefined): boolean {
  if (c === true) return true;
  if (c === null || c === undefined || c === false) return false;
  if (typeof c === 'number') return c === 1;
  return ['true', 'vero', 'si', 'sì', 'x', 'yes', '1', 'checked'].includes(String(c).trim().toLowerCase());
}

export function aDataIso(c: Cella | undefined): string | null {
  if (c === null || c === undefined || c === '') return null;
  if (c instanceof Date) return toIso(c);
  const s = String(c).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
  if (m) {
    const anno = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${anno}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

function trovaIntestazione(righe: Cella[][]): number {
  for (let i = 0; i < Math.min(righe.length, 15); i++) {
    if (righe[i].some((c) => c !== null && normIntestazione(cellaInTesto(c)) === 'COMMESSA')) return i;
  }
  return -1;
}

/** Cerca, tra i fogli del file, quello con la colonna COMMESSA e ne legge le righe */
export function leggiSmartsheet(fogli: Foglio[]): LetturaSmartsheet {
  const foglio = fogli.find((f) => trovaIntestazione(f.righe) >= 0);
  if (!foglio) {
    return {
      righe: [],
      colonneMancanti: OBBLIGATORI.map((o) => o.nome),
      haDataCons: false,
      foglio: fogli[0]?.nome ?? '',
    };
  }
  const iInt = trovaIntestazione(foglio.righe);
  const intestazioni = foglio.righe[iInt].map((c) => normIntestazione(cellaInTesto(c)));
  const col = {} as Record<Campo, number>;
  (Object.keys(ALIAS) as Campo[]).forEach((campo) => {
    col[campo] = intestazioni.findIndex((h) => (ALIAS[campo] as readonly string[]).includes(h));
  });

  const colonneMancanti = OBBLIGATORI.filter((o) => col[o.campo] < 0).map((o) => o.nome);
  const val = (r: Cella[], campo: Campo): Cella | undefined => (col[campo] >= 0 ? r[col[campo]] : undefined);
  const txt = (r: Cella[], campo: Campo): string | null => {
    const t = cellaInTesto(val(r, campo));
    return t === '' ? null : t;
  };

  const righe: RigaSmartsheet[] = [];
  for (const r of foglio.righe.slice(iInt + 1)) {
    const commessa = txt(r, 'commessa');
    if (!commessa) continue;
    const via = txt(r, 'indirizzo');
    const paese = txt(r, 'paese');
    const prov = txt(r, 'provincia');
    const localita = paese ? (prov ? `${paese} (${prov})` : paese) : null;
    const indirizzo = [via, localita].filter(Boolean).join(', ') || null;
    righe.push({
      commessa,
      cliente: txt(r, 'cliente'),
      indirizzo,
      imballo: aBooleano(val(r, 'imballo')),
      cavallette: cellaInTesto(val(r, 'cavallette')),
      // la spunta può anche contenere direttamente una data (vale come spunta)
      ddtCons: aBooleano(val(r, 'ddtCons')) || aDataIso(val(r, 'ddtCons')) !== null,
      ddtRientro: aBooleano(val(r, 'ddtRientro')) || aDataIso(val(r, 'ddtRientro')) !== null,
      dataCons: aDataIso(val(r, 'dataCons')) ?? aDataIso(val(r, 'ddtCons')),
      dataRientro: aDataIso(val(r, 'dataRientro')) ?? aDataIso(val(r, 'ddtRientro')),
    });
  }
  return { righe, colonneMancanti, haDataCons: righe.some((x) => x.dataCons !== null || x.dataRientro !== null), foglio: foglio.nome };
}

// ---------------------------------------------------------------------------

export interface StatoImport {
  cavallette: Cavalletta[]; // non restituite
  cicli: Ciclo[];
}

export interface OpzioniImport {
  oggi: string;
  /** ignora le righe con data uscita precedente a questa (utile al primo import) */
  dal?: string | null;
}

export interface Azione {
  cavallettaId: string;
  numero: string;
  tipo: 'imballata' | 'consegnata' | 'rientrata';
  commessa: string;
  cliente: string | null;
  patch: Partial<Cavalletta>;
}

export interface AnomaliaNuova {
  tipo: 'sconosciuta' | 'gia_in_uso';
  numero: string;
  commessa: string;
  dettaglio: string;
}

export interface Piano {
  azioni: Azione[];
  cicli: Ciclo[];
  anomalie: AnomaliaNuova[];
  /** coppie numero+commessa ora regolari: le segnalazioni aperte corrispondenti si chiudono */
  risolte: { numero: string; commessa: string }[];
  riepilogo: {
    righeConCavallette: number;
    imballate: number;
    consegnate: number;
    rientrate: number;
    registrate: number;
    giaAggiornate: number;
    escluse: number;
    anomalie: number;
  };
}

const FASE_TIPO = { 1: 'imballata', 2: 'consegnata', 3: 'rientrata' } as const;

/** La riga di Smartsheet riguarda un giro successivo all'arrivo della cavalletta? Senza date non si può sapere. */
function rientroDopoArrivo(dataCons: string | null, dataArrivo: string | null): boolean {
  return dataCons !== null && dataArrivo !== null && dataCons >= dataArrivo;
}

export function pianificaImport(righe: RigaSmartsheet[], stato: StatoImport, opz: OpzioniImport): Piano {
  const cav = new Map<string, Cavalletta>();
  for (const c of stato.cavallette) if (!c.restituita) cav.set(c.numero, { ...c });

  const chiaveCiclo = (id: string, commessa: string): string => `${id}|${commessa}`;
  const cicli = new Map<string, Ciclo>();
  const perCav = new Map<string, Ciclo[]>();
  const registra = (c: Ciclo): void => {
    cicli.set(chiaveCiclo(c.cavalletta_id, c.commessa), c);
    const lista = (perCav.get(c.cavalletta_id) ?? []).filter((x) => x.commessa !== c.commessa);
    lista.push(c);
    perCav.set(c.cavalletta_id, lista);
  };
  for (const c of stato.cicli) registra({ ...c });

  const piano: Piano = {
    azioni: [],
    cicli: [],
    anomalie: [],
    risolte: [],
    riepilogo: { righeConCavallette: 0, imballate: 0, consegnate: 0, rientrate: 0, registrate: 0, giaAggiornate: 0, escluse: 0, anomalie: 0 },
  };
  const anomalieViste = new Set<string>();
  const segnala = (tipo: AnomaliaNuova['tipo'], numero: string, commessa: string, dettaglio: string): void => {
    const k = `${tipo}|${numero}|${commessa}`;
    if (anomalieViste.has(k)) return;
    anomalieViste.add(k);
    piano.anomalie.push({ tipo, numero, commessa, dettaglio });
    piano.riepilogo.anomalie++;
  };

  for (const riga of righe) {
    const fase = riga.ddtRientro ? 3 : riga.ddtCons ? 2 : riga.imballo ? 1 : 0;
    if (fase === 0) continue;
    const chiavi = spezzaCavallette(riga.cavallette);
    if (!chiavi.length) continue;
    const dataRiga = riga.dataCons ?? riga.dataRientro;
    if (opz.dal && dataRiga && dataRiga < opz.dal) {
      piano.riepilogo.escluse++;
      continue;
    }
    piano.riepilogo.righeConCavallette++;

    for (const scritto of chiavi) {
      const trovato = trovaNumero(scritto, cav.keys());
      const c = trovato ? cav.get(trovato) : undefined;
      const chiave = c ? c.numero : scritto;
      if (!c) {
        segnala('sconosciuta', chiave, riga.commessa, `La cavalletta ${chiave} è indicata nella commessa ${riga.commessa} ma non è in anagrafica (non è stata caricata da un DDT?).`);
        continue;
      }
      const esistente = cicli.get(chiaveCiclo(c.id, riga.commessa));
      const faseAttuale = esistente?.fase ?? 0;
      if (fase <= faseAttuale) {
        piano.riepilogo.giaAggiornate++;
        continue;
      }

      const assegnataQui = c.commessa === riga.commessa;
      if (!esistente && fase < 3) {
        const aperto = (perCav.get(c.id) ?? []).find((x) => x.fase < 3 && x.commessa !== riga.commessa);
        const occupataDa = aperto?.commessa ?? (c.commessa && !assegnataQui ? c.commessa : null);
        if (occupataDa) {
          segnala('gia_in_uso', chiave, riga.commessa, `La cavalletta ${chiave} è assegnata alla commessa ${riga.commessa}, ma risulta ancora in uso sulla commessa ${occupataDa}.`);
          continue;
        }
      }

      let patch: Partial<Cavalletta> | null = null;
      if (fase === 1 || fase === 2) {
        patch = {
          luogo: fase === 2 ? 'cliente' : 'piazzale',
          stato: 'piena_serramenti',
          commessa: riga.commessa,
          cliente: riga.cliente,
          indirizzo: riga.indirizzo,
          data_uscita: null,
          data_consegna: fase === 2 ? (riga.dataCons ?? opz.oggi) : null,
          contenuto: null,
        };
      } else if (assegnataQui || (!c.commessa && rientroDopoArrivo(riga.dataRientro ?? riga.dataCons, c.data_arrivo))) {
        // rientro: la cavalletta torna vuota in piazzale. Se non era abbinata a questa commessa, lo si applica
        // solo quando la data della consegna è dopo il suo arrivo (altrimenti potrebbe essere un giro vecchio).
        patch = {
          luogo: 'piazzale',
          stato: 'vuota',
          commessa: null,
          cliente: null,
          indirizzo: null,
          data_uscita: null,
          data_consegna: null,
          contenuto: null,
        };
      }

      if (patch) {
        Object.assign(c, patch);
        piano.azioni.push({ cavallettaId: c.id, numero: c.numero, tipo: FASE_TIPO[fase], commessa: riga.commessa, cliente: riga.cliente, patch });
        if (fase === 1) piano.riepilogo.imballate++;
        else if (fase === 2) piano.riepilogo.consegnate++;
        else piano.riepilogo.rientrate++;
      } else {
        piano.riepilogo.registrate++;
      }

      registra({
        cavalletta_id: c.id,
        commessa: riga.commessa,
        fase,
        cliente: riga.cliente,
        indirizzo: riga.indirizzo,
        data_uscita: null,
        data_consegna: esistente?.data_consegna ?? riga.dataCons ?? (fase === 2 ? opz.oggi : null),
        data_rientro: fase === 3 ? (riga.dataRientro ?? opz.oggi) : null,
      });
      piano.risolte.push({ numero: chiave, commessa: riga.commessa });
    }
  }

  // un solo record per coppia cavalletta+commessa (l'ultimo, il più avanzato)
  const finali = new Map<string, Ciclo>();
  const toccati = new Set<string>();
  for (const a of piano.azioni) toccati.add(chiaveCiclo(a.cavallettaId, a.commessa));
  for (const r of piano.risolte) {
    const c = cav.get(r.numero);
    if (c) toccati.add(chiaveCiclo(c.id, r.commessa));
  }
  for (const k of toccati) {
    const c = cicli.get(k);
    if (c) finali.set(k, c);
  }
  piano.cicli = [...finali.values()];
  return piano;
}
