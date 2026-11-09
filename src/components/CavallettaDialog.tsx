import { useEffect, useState } from 'react';
import type { Cavalletta, Evento, Luogo, Stato } from '../lib/types.ts';
import { caricaEventi, correggiCavalletta, eliminaCavalletta } from '../lib/api.ts';
import { formattaData } from '../lib/dates.ts';
import { daRitirare, etichettaLuogo, etichettaStato, giacenza, giorniInCantiere } from '../lib/logica.ts';
import { useDati } from '../lib/dati.tsx';
import { useAuth } from '../lib/auth.tsx';
import { Messaggio, dataOra } from './ui.tsx';

const NOMI_EVENTO: Record<string, string> = {
  arrivata: 'Arrivata dal fornitore',
  interna: 'Aggiunta (cavalletta interna)',
  imballata: 'Imballata (commessa abbinata)',
  consegnata: 'Consegnata al cliente',
  rientrata: 'Rientrata in piazzale, vuota',
  non_usata: 'Segnata vuota: non usata in produzione',
  restituita: 'Restituita alla vetreria',
  correzione: 'Correzione manuale',
};

function descriviEvento(e: Evento): string {
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

interface Props {
  cavalletta: Cavalletta;
  onChiudi: () => void;
  onModificata: () => void;
}

export default function CavallettaDialog({ cavalletta: c, onChiudi, onModificata }: Props) {
  const { oggi, chiusure, soglia, nomeVetreria } = useDati();
  const { profilo } = useAuth();
  const admin = profilo?.ruolo === 'admin';
  const puoCorreggere = admin || profilo?.ruolo === 'amministrazione' || profilo?.ruolo === 'ufficio';
  const [eventi, setEventi] = useState<Evento[] | null>(null);
  const [modifica, setModifica] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [occupato, setOccupato] = useState(false);
  const [f, setF] = useState({
    luogo: c.luogo as Luogo,
    stato: c.stato as Stato,
    commessa: c.commessa ?? '',
    cliente: c.cliente ?? '',
    indirizzo: c.indirizzo ?? '',
    data_consegna: c.data_consegna ?? '',
    note: c.note ?? '',
  });

  useEffect(() => {
    let annullato = false;
    caricaEventi(c.id)
      .then((e) => {
        if (!annullato) setEventi(e);
      })
      .catch(() => {
        if (!annullato) setEventi([]);
      });
    return () => {
      annullato = true;
    };
  }, [c.id]);

  const allerta = daRitirare(c, oggi, chiusure, soglia);
  const gg = giacenza(c, oggi);
  const cant = giorniInCantiere(c, oggi, chiusure);

  async function salva(): Promise<void> {
    setErrore(null);
    setOccupato(true);
    try {
      const vuoto = (s: string): string | null => (s.trim() === '' ? null : s.trim());
      const patch: Partial<Cavalletta> = {
        luogo: f.luogo,
        stato: f.stato,
        commessa: vuoto(f.commessa),
        cliente: vuoto(f.cliente),
        indirizzo: vuoto(f.indirizzo),
        data_consegna: vuoto(f.data_consegna),
        note: vuoto(f.note),
      };
      if (patch.stato === 'vuota') patch.contenuto = null;
      await correggiCavalletta(c, patch);
      onModificata();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore durante il salvataggio');
    } finally {
      setOccupato(false);
    }
  }

  async function elimina(): Promise<void> {
    if (!window.confirm(`Eliminare definitivamente la cavalletta ${c.numero}? Usa questa funzione solo per errori di inserimento.`)) return;
    try {
      await eliminaCavalletta(c.id);
      onModificata();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore');
    }
  }

  return (
    <div className="overlay" onClick={onChiudi}>
      <div className="dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Cavalletta ${c.numero}`}>
        <div className="dialog-testa">
          <h2>
            Cavalletta {c.numero} <span className="sotto">· {nomeVetreria(c.vetreria)}</span>
          </h2>
          <button className="btn" onClick={onChiudi}>Chiudi</button>
        </div>

        {errore && <Messaggio tipo="errore">{errore}</Messaggio>}

        {!modifica ? (
          <dl className="dettagli">
            <dt>Luogo</dt><dd>{etichettaLuogo(c)}</dd>
            <dt>Stato</dt><dd>{etichettaStato(c, allerta)}</dd>
            {c.commessa && (<><dt>Commessa</dt><dd>{c.commessa}</dd></>)}
            {c.cliente && (<><dt>Cliente</dt><dd>{c.cliente}</dd></>)}
            {c.indirizzo && (<><dt>Indirizzo</dt><dd>{c.indirizzo}</dd></>)}
            {c.contenuto && (<><dt>Contenuto</dt><dd>{c.contenuto}</dd></>)}
            {c.data_arrivo && (<><dt>Arrivata il</dt><dd>{formattaData(c.data_arrivo)}{c.ddt_arrivo ? ` (DDT ${c.ddt_arrivo})` : ''}</dd></>)}
            {gg !== null && (<><dt>Giacenza</dt><dd>{gg} giorni</dd></>)}
            {c.data_consegna && (<><dt>Dal cliente da</dt><dd>{formattaData(c.data_consegna)}{cant !== null ? ` (${cant} giorni lavorativi)` : ''}</dd></>)}
            {c.note && (<><dt>Note</dt><dd>{c.note}</dd></>)}
          </dl>
        ) : (
          <div className="form">
            <p className="nota">Correzione manuale: la modifica viene registrata nello storico.</p>
            <label>Luogo
              <select value={f.luogo} onChange={(e) => setF({ ...f, luogo: e.target.value as Luogo })}>
                <option value="piazzale">Piazzale</option>
                <option value="cliente">Dal cliente</option>
              </select>
            </label>
            <label>Stato
              <select value={f.stato} onChange={(e) => setF({ ...f, stato: e.target.value as Stato })}>
                <option value="piena_vetri">Piena (vetri)</option>
                <option value="piena_serramenti">Piena (serramenti)</option>
                <option value="vuota">Vuota</option>
              </select>
            </label>
            <label>Commessa<input value={f.commessa} onChange={(e) => setF({ ...f, commessa: e.target.value })} /></label>
            <label>Cliente<input value={f.cliente} onChange={(e) => setF({ ...f, cliente: e.target.value })} /></label>
            <label>Indirizzo<input value={f.indirizzo} onChange={(e) => setF({ ...f, indirizzo: e.target.value })} /></label>
            <label>Dal cliente da (data)<input type="date" value={f.data_consegna} onChange={(e) => setF({ ...f, data_consegna: e.target.value })} /></label>
            <label>Note<textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} rows={2} /></label>
            <div className="riga-bottoni">
              <button className="btn btn-primary" disabled={occupato} onClick={() => void salva()}>Salva correzione</button>
              <button className="btn" onClick={() => setModifica(false)}>Annulla</button>
            </div>
          </div>
        )}

        {puoCorreggere && !modifica && !c.restituita && (
          <div className="riga-bottoni">
            <button className="btn" onClick={() => setModifica(true)}>Correggi a mano</button>
            {admin && <button className="btn btn-danger" onClick={() => void elimina()}>Elimina (errore di inserimento)</button>}
          </div>
        )}

        <h3>Storico</h3>
        {eventi === null ? (
          <p className="nota">Caricamento…</p>
        ) : eventi.length === 0 ? (
          <p className="nota">Nessun evento registrato.</p>
        ) : (
          <ul className="storico">
            {eventi.map((e) => (
              <li key={e.id}>
                <strong>{NOMI_EVENTO[e.tipo] ?? e.tipo}</strong>
                <span className="sotto"> · {dataOra(e.creato_il)}</span>
                {descriviEvento(e) && <div className="sotto">{descriviEvento(e)}</div>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
