import { useEffect, useMemo, useState } from 'react';
import { useDati } from '../lib/dati.tsx';
import { caricaCicli, caricaCommesse, registraImballo } from '../lib/api.ts';
import { confrontaNumeri } from '../lib/keys.ts';
import { formattaData } from '../lib/dates.ts';
import { Badge, Messaggio, Titolo } from '../components/ui.tsx';
import type { Cavalletta } from '../lib/types.ts';

/** per confrontare i numeri di commessa senza badare a maiuscole e spazi ("26031 p" = "26031-P") */
function chiaveCommessa(t: string): string {
  return t.toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

export default function Imballo() {
  const { cavallette, oggi, nomeVetreria, ricarica } = useDati();
  const [data, setData] = useState(oggi);
  const [commessa, setCommessa] = useState('');
  const [cliente, setCliente] = useState('');
  const [clienteManuale, setClienteManuale] = useState(false);
  const [contenuto, setContenuto] = useState('');
  const [cerca, setCerca] = useState('');
  const [scelte, setScelte] = useState<Set<string>>(new Set());
  const [clientiSmartsheet, setClientiSmartsheet] = useState<Map<string, string>>(new Map());
  const [lavoro, setLavoro] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [esito, setEsito] = useState<string | null>(null);

  // clienti già noti (da Smartsheet): servono solo a precompilare, se non ci sono si scrive a mano o si lascia vuoto
  useEffect(() => {
    const m = new Map<string, string>();
    for (const c of cavallette) if (c.commessa && c.cliente) m.set(chiaveCommessa(c.commessa), c.cliente);
    setClientiSmartsheet(new Map(m));
    Promise.all([caricaCommesse(), caricaCicli()])
      .then(([commesse, cicli]) => {
        for (const c of commesse) if (c.cliente) m.set(chiaveCommessa(c.commessa), c.cliente);
        for (const c of cicli) if (c.cliente && !m.has(chiaveCommessa(c.commessa))) m.set(chiaveCommessa(c.commessa), c.cliente);
        setClientiSmartsheet(new Map(m));
      })
      .catch(() => undefined);
  }, [cavallette]);

  const trovato = commessa.trim() ? clientiSmartsheet.get(chiaveCommessa(commessa)) ?? null : null;
  useEffect(() => {
    if (!clienteManuale) setCliente(trovato ?? '');
  }, [trovato, clienteManuale]);

  // cavallette che si possono imballare: in piazzale e non già piene di serramenti
  const libere = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return cavallette
      .filter((c) => !c.restituita && c.luogo === 'piazzale' && c.stato !== 'piena_serramenti')
      .filter((c) => !q || c.numero.toLowerCase().includes(q) || (c.etichetta ?? '').toLowerCase().includes(q))
      .sort((a, b) => confrontaNumeri(a.numero, b.numero));
  }, [cavallette, cerca]);

  const imballate = useMemo(
    () =>
      cavallette
        .filter((c) => !c.restituita && c.luogo === 'piazzale' && c.stato === 'piena_serramenti')
        .sort((a, b) => (a.commessa ?? '').localeCompare(b.commessa ?? '', 'it', { numeric: true }) || confrontaNumeri(a.numero, b.numero)),
    [cavallette],
  );

  function alterna(id: string): void {
    setScelte((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const pronte = cavallette.filter((c) => scelte.has(c.id));
  const puoSalvare = commessa.trim() !== '' && pronte.length > 0 && data !== '' && !lavoro;

  async function salva(): Promise<void> {
    setLavoro(true);
    setErrore(null);
    setEsito(null);
    try {
      await registraImballo({
        data,
        commessa: commessa.trim(),
        cliente: cliente.trim() || null,
        contenuto: contenuto.trim() || null,
        cavallette: pronte,
      });
      setEsito(`Imballo registrato: ${pronte.map((c) => c.numero).join(', ')} → commessa ${commessa.trim()}.`);
      setScelte(new Set());
      setCommessa('');
      setCliente('');
      setClienteManuale(false);
      setContenuto('');
      await ricarica();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore nel salvataggio');
    } finally {
      setLavoro(false);
    }
  }

  return (
    <>
      <Titolo titolo="Imballo" sotto="Registra le cavallette imballate per una commessa: da qui risultano piene di serramenti." />
      {errore && <Messaggio tipo="errore">{errore}</Messaggio>}
      {esito && <Messaggio tipo="ok">{esito}</Messaggio>}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form griglia">
          <label>Data
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </label>
          <label>Commessa
            <input value={commessa} onChange={(e) => setCommessa(e.target.value)} placeholder="es. 26031-P" />
          </label>
          <label>Cliente <span className="nota">(facoltativo)</span>
            <input
              value={cliente}
              onChange={(e) => {
                setCliente(e.target.value);
                setClienteManuale(true);
              }}
              placeholder={commessa.trim() && !trovato ? 'non trovato in Smartsheet: scrivilo o lascia vuoto' : ''}
            />
          </label>
          <label>Cosa contiene <span className="nota">(facoltativo)</span>
            <input value={contenuto} onChange={(e) => setContenuto(e.target.value)} placeholder="es. 4 finestre + portoncino" />
          </label>
        </div>
        {trovato && !clienteManuale && <p className="nota">Cliente preso da Smartsheet.</p>}

        <h3>Cavalletta</h3>
        <input className="cerca" placeholder="Cerca numero…" value={cerca} onChange={(e) => setCerca(e.target.value)} />
        <div className="scorri" style={{ maxHeight: 260, marginTop: 8 }}>
          {libere.length === 0 && <p className="vuoto">Nessuna cavalletta libera in piazzale.</p>}
          {libere.map((c: Cavalletta) => (
            <label key={c.id} className="riga-scelta">
              <input type="checkbox" checked={scelte.has(c.id)} onChange={() => alterna(c.id)} />
              <strong>{c.numero}</strong> <span className="nota">{nomeVetreria(c.vetreria)} · {c.stato === 'vuota' ? 'vuota' : 'piena di vetri'}</span>
            </label>
          ))}
        </div>
        <p className="nota">{pronte.length} selezionate</p>
        <button className="btn btn-primary" disabled={!puoSalvare} onClick={() => void salva()}>
          {lavoro ? 'Salvo…' : 'Registra imballo'}
        </button>
      </div>

      <h3>Imballate, in piazzale ({imballate.length})</h3>
      {imballate.length === 0 ? (
        <p className="vuoto">Nessuna cavalletta imballata in attesa.</p>
      ) : (
        <div className="scorri">
          <table className="tabella">
            <thead>
              <tr><th>N.</th><th>Commessa</th><th>Cliente</th><th>Contenuto</th><th>Data</th><th>Stato</th></tr>
            </thead>
            <tbody>
              {imballate.map((c) => (
                <tr key={c.id}>
                  <td className="numero">{c.numero}</td>
                  <td>{c.commessa}</td>
                  <td>{c.cliente}</td>
                  <td>{c.contenuto}</td>
                  <td>{formattaData(c.data_uscita)}</td>
                  <td><Badge tono="giallo">Piena (serramenti)</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
