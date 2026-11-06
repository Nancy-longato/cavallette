export type Ruolo = 'admin' | 'ufficio' | 'logistica' | 'amministrazione' | 'magazziniere' | 'nessuno';
export type Luogo = 'piazzale' | 'cliente';
export type Stato = 'piena_vetri' | 'piena_serramenti' | 'vuota';

export interface Profilo {
  id: string;
  email: string | null;
  nome: string | null;
  ruolo: Ruolo;
}

export interface Vetreria {
  codice: string;
  nome: string;
  restituibile: boolean;
  ordine: number;
}

export interface Cavalletta {
  id: string;
  numero: string;
  vetreria: string;
  etichetta: string | null;
  contenuto: string | null;
  data_arrivo: string | null;
  ddt_arrivo: string | null;
  luogo: Luogo;
  stato: Stato;
  commessa: string | null;
  cliente: string | null;
  indirizzo: string | null;
  data_uscita: string | null;
  data_consegna: string | null;
  note: string | null;
  restituita: boolean;
  restituita_il: string | null;
  restituzione_id: string | null;
  creata_il: string;
  aggiornata_il: string;
}

export interface Ciclo {
  id?: string;
  cavalletta_id: string;
  commessa: string;
  fase: 1 | 2 | 3;
  cliente: string | null;
  indirizzo: string | null;
  data_uscita: string | null;
  data_consegna: string | null;
  data_rientro: string | null;
}

export interface Anomalia {
  id: number;
  tipo: 'sconosciuta' | 'gia_in_uso' | string;
  numero: string;
  commessa: string;
  dettaglio: string | null;
  creata_il: string;
  risolta: boolean;
  risolta_il: string | null;
}

export interface Evento {
  id: number;
  cavalletta_id: string;
  tipo: string;
  dettaglio: Record<string, unknown>;
  utente: string | null;
  creato_il: string;
}

export interface Restituzione {
  id: string;
  vetreria: string;
  data: string;
  creata_il: string;
}

export const LONGATO = 'L';
