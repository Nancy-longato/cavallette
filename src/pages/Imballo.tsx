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
  const [indirizzo, setIndirizzo] = useState('');
  const [indirizzoManuale, setIndirizzoManuale] = useState(false);
  const [contenuto, setContenuto] = useState('');
  const [testoCav, setTestoCav] = useState('');
  const [clienti, setClienti] = useState<Map<string, { cliente: string | null; indirizzo: string | null }>>(new Map());
  const [lavoro, setLavoro] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [esito, setEsito] = useState<string | null>(null);

  // clienti già noti (da Smartsheet): servono solo a precompilare, se non ci sono si scrive a mano o si lascia vuoto
  useEffect(() => {
    const m = new Map<string, { cliente: string | null; indirizzo: string | null }>();
    const aggiungi = (commessa: string, cliente: string | null, indirizzo: string | null): void => {
      if (!cliente && !indirizzo) return;
      const k = chiaveCommessa(commessa);
      const prima = m.get(k);
      m.set(k, { cliente: cliente ?? prima?.cliente ?? null, indirizzo: indirizzo ?? prima?.indirizzo ?? null });
    };
    for (const c of cavallette) if (c.commessa) aggiungi(c.commessa, c.cliente, c.indirizzo);
    setClienti(new Map(m));
    Promise.all([caricaCommesse(), caricaCicli()])
      .then(([commesse, cicli]) => {
        for (const c of cicli) aggiungi(c.commessa, c.cliente, c.indirizzo);
        for (const c of commesse) m.set(chiaveCommessa(c.commessa), { cliente: c.cliente, indirizzo: c.indirizzo }); // Smartsheet prevale
        setClienti(new Map(m));
      })
      .catch(() => undefined);
  }, [cavallette]);

  const noto = commessa.trim() ? clienti.get(chiaveCommessa(commessa)) ?? null : null;
  const trovato = noto?.cliente ?? null;
  const trovatoInd = noto?.indirizzo ?? null;
  useEffect(() => {
    if (!clienteManuale) setCliente(trovato ?? '');
  }, [trovato, clienteManuale]);
  useEffect(() => {
    if (!indirizzoManuale) setIndirizzo(trovatoInd ?? '');
  }, [trovatoInd, indirizzoManuale]);

  const tutte = useMemo(() => new Map(cavallette.filter((c) => !c.restituita).map((c) => [c.numero, c])), [cavallette]);

  const lette = useMemo(() => {
    const ok: Cavalletta[] = []; // presenti a sistema e libere
    const occupate: { c: Cavalletta; perche: string }[] = []; // presenti ma non imballabili
    const no: string[] = []; // non presenti a sistema
    for (const scritto of spezzaCavallette(testoCav)) {
      const n = trovaNumero(scritto, tutte.keys());
      const c = n ? tutte.get(n) : undefined;
      if (!c) no.push(scritto);
      else if (c.stato !== 'piena_serramenti' || (c.commessa !== null && chiaveCommessa(c.commessa) === chiaveCommessa(commessa))) {
        // il luogo non conta: l'unico problema è sovrascrivere un'altra commessa non ancora liberata
        if (!ok.includes(c)) ok.push(c);
      } else {
        occupate.push({ c, perche: `è ancora piena della commessa ${c.commessa ?? '?'}` });
      }
    }
    return { ok, occupate, no };
  }, [testoCav, tutte, commessa]);

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
        indirizzo: indirizzo.trim() || null,
        contenuto: contenuto.trim() || null,
        cavallette: lette.ok,
      });
      setEsito(`Fatto: ${lette.ok.map((c) => c.numero).join(', ')} → commessa ${commessa.trim()}.`);
      setCommessa('');
      setCliente('');
      setClienteManuale(false);
      setIndirizzo('');
      setIndirizzoManuale(false);
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
          Indirizzo <span className="nota">{trovatoInd && !indirizzoManuale ? '· preso da Smartsheet' : '· facoltativo'}</span>
          <input
            value={indirizzo}
            onChange={(e) => {
              setIndirizzo(e.target.value);
              setIndirizzoManuale(true);
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
