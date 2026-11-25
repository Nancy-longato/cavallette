import { useEffect, useMemo, useState } from 'react';
import { useDati } from '../lib/dati.tsx';
import { caricaCicli, caricaCommesse, registraImballo } from '../lib/api.ts';
import { spezzaCavallette, trovaNumero } from '../lib/keys.ts';
import { Messaggio } from '../components/ui.tsx';
import type { Cavalletta } from '../lib/types.ts';

/** per confrontare i numeri di commessa senza badare a maiuscole e spazi ("26031 p" = "26031-P") */
function chiaveCommessa(t: string): string {
  return t.toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

export default function Imballo() {
  const { cavallette, oggi, ricarica } = useDati();
  const [data, setData] = useState(oggi);
  const [commessa, setCommessa] = useState('');
  const [cliente, setCliente] = useState('');
  const [clienteManuale, setClienteManuale] = useState(false);
  const [contenuto, setContenuto] = useState('');
  const [testoCav, setTestoCav] = useState('');
  const [clienti, setClienti] = useState<Map<string, string>>(new Map());
  const [lavoro, setLavoro] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [esito, setEsito] = useState<string | null>(null);

  // clienti già noti (da Smartsheet): servono solo a precompilare, se non ci sono si scrive a mano o si lascia vuoto
  useEffect(() => {
    const m = new Map<string, string>();
    for (const c of cavallette) if (c.commessa && c.cliente) m.set(chiaveCommessa(c.commessa), c.cliente);
    setClienti(new Map(m));
    Promise.all([caricaCommesse(), caricaCicli()])
      .then(([commesse, cicli]) => {
        for (const c of commesse) if (c.cliente) m.set(chiaveCommessa(c.commessa), c.cliente);
        for (const c of cicli) if (c.cliente && !m.has(chiaveCommessa(c.commessa))) m.set(chiaveCommessa(c.commessa), c.cliente);
        setClienti(new Map(m));
      })
      .catch(() => undefined);
  }, [cavallette]);

  const trovato = commessa.trim() ? clienti.get(chiaveCommessa(commessa)) ?? null : null;
  useEffect(() => {
    if (!clienteManuale) setCliente(trovato ?? '');
  }, [trovato, clienteManuale]);

  // cavallette imballabili: in piazzale e non già piene di serramenti
  const libere = useMemo(
    () => new Map(cavallette.filter((c) => !c.restituita && c.luogo === 'piazzale' && c.stato !== 'piena_serramenti').map((c) => [c.numero, c])),
    [cavallette],
  );

  const tutte = useMemo(() => new Map(cavallette.filter((c) => !c.restituita).map((c) => [c.numero, c])), [cavallette]);

  const lette = useMemo(() => {
    const ok: Cavalletta[] = []; // presenti a sistema e libere
    const occupate: { c: Cavalletta; perche: string }[] = []; // presenti ma non imballabili
    const no: string[] = []; // non presenti a sistema
    for (const scritto of spezzaCavallette(testoCav)) {
      const n = trovaNumero(scritto, tutte.keys());
      const c = n ? tutte.get(n) : undefined;
      if (!c) no.push(scritto);
      else if (libere.has(c.numero)) {
        if (!ok.includes(c)) ok.push(c);
      } else {
        occupate.push({ c, perche: c.luogo === 'cliente' ? 'è dal cliente' : `è già piena${c.commessa ? ` (commessa ${c.commessa})` : ''}` });
      }
    }
    return { ok, occupate, no };
  }, [testoCav, tutte, libere]);

  const puoSalvare = commessa.trim() !== '' && lette.ok.length > 0 && lette.occupate.length === 0 && lette.no.length === 0 && data !== '' && !lavoro;

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
        cavallette: lette.ok,
      });
      setEsito(`Fatto: ${lette.ok.map((c) => c.numero).join(', ')} → commessa ${commessa.trim()}.`);
      setCommessa('');
      setCliente('');
      setClienteManuale(false);
      setContenuto('');
      setTestoCav('');
      await ricarica();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore nel salvataggio');
    } finally {
      setLavoro(false);
    }
  }

  return (
    <div className="imballo">
      <h1>Imballo</h1>
      {errore && <Messaggio tipo="errore">{errore}</Messaggio>}
      {esito && <Messaggio tipo="ok">{esito}</Messaggio>}

      <div className="imballo-card">
        <div className="imballo-riga">
          <label className="imballo-grande">
            Commessa
            <input value={commessa} onChange={(e) => setCommessa(e.target.value)} placeholder="26031-P" autoFocus />
          </label>
          <label className="imballo-data">
            Data
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </label>
        </div>

        <label>
          Cliente <span className="nota">{trovato && !clienteManuale ? '· preso da Smartsheet' : '· facoltativo'}</span>
          <input
            value={cliente}
            onChange={(e) => {
              setCliente(e.target.value);
              setClienteManuale(true);
            }}
          />
        </label>

        <label>
          Cavalletta
          <input value={testoCav} onChange={(e) => setTestoCav(e.target.value)} placeholder="62, P-E82, 63" />
        </label>
        {(lette.ok.length > 0 || lette.occupate.length > 0 || lette.no.length > 0) && (
          <div className="imballo-chip">
            {lette.ok.map((c) => (
              <span key={c.id} className="chip chip-ok">{c.numero}</span>
            ))}
            {lette.occupate.map(({ c, perche }) => (
              <span key={c.id} className="chip chip-occ" title={`Presente a sistema, ma ${perche}`}>{c.numero} · {perche}</span>
            ))}
            {lette.no.map((n) => (
              <span key={n} className="chip chip-no" title="Non trovata a sistema">{n} · non trovata</span>
            ))}
          </div>
        )}

        <label>
          Cosa contiene <span className="nota">· facoltativo</span>
          <input value={contenuto} onChange={(e) => setContenuto(e.target.value)} />
        </label>

        <button className="btn btn-primary btn-big" disabled={!puoSalvare} onClick={() => void salva()}>
          {lavoro ? 'Salvo…' : 'Segna come piena'}
        </button>
      </div>
    </div>
  );
}
