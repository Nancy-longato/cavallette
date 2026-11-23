import { useMemo, useState } from 'react';
import { useDati } from '../lib/dati.tsx';
import { confrontaNumeri } from '../lib/keys.ts';
import { formattaData } from '../lib/dates.ts';
import { Badge, Messaggio, Titolo } from '../components/ui.tsx';
import type { Cavalletta } from '../lib/types.ts';

/** per confrontare i numeri di commessa senza badare a maiuscole e spazi ("26031 p" trova "26031-P") */
function chiaveCommessa(t: string): string {
  return t.toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

interface Gruppo {
  commessa: string;
  cliente: string | null;
  indirizzo: string | null;
  cavallette: Cavalletta[];
}

export default function DaConsegnare() {
  const { cavallette, oggi, nomeVetreria, errore } = useDati();
  const [cerca, setCerca] = useState('');
  const [scelte, setScelte] = useState<Set<string>>(new Set());
  const [copiato, setCopiato] = useState(false);

  const gruppi = useMemo<Gruppo[]>(() => {
    const k = chiaveCommessa(cerca);
    if (!k) return [];
    const m = new Map<string, Gruppo>();
    for (const c of cavallette) {
      if (c.restituita || !c.commessa || !chiaveCommessa(c.commessa).includes(k)) continue;
      const g = m.get(c.commessa) ?? { commessa: c.commessa, cliente: c.cliente, indirizzo: c.indirizzo, cavallette: [] };
      g.cavallette.push(c);
      m.set(c.commessa, g);
    }
    const out = [...m.values()];
    for (const g of out) g.cavallette.sort((a, b) => confrontaNumeri(a.numero, b.numero));
    // prima la commessa scritta esattamente, poi le altre in ordine
    return out.sort((a, b) => Number(chiaveCommessa(b.commessa) === k) - Number(chiaveCommessa(a.commessa) === k) || a.commessa.localeCompare(b.commessa, 'it', { numeric: true }));
  }, [cavallette, cerca]);

  const prontaDaConsegnare = (c: Cavalletta): boolean => c.luogo === 'piazzale';

  // le cavallette scelte, raggruppate per commessa (restano scelte anche cambiando ricerca)
  const riepilogo = useMemo<Gruppo[]>(() => {
    const m = new Map<string, Gruppo>();
    for (const c of cavallette) {
      if (!scelte.has(c.id) || c.restituita || !c.commessa) continue;
      const g = m.get(c.commessa) ?? { commessa: c.commessa, cliente: c.cliente, indirizzo: c.indirizzo, cavallette: [] };
      g.cavallette.push(c);
      m.set(c.commessa, g);
    }
    const out = [...m.values()];
    for (const g of out) g.cavallette.sort((a, b) => confrontaNumeri(a.numero, b.numero));
    return out.sort((a, b) => a.commessa.localeCompare(b.commessa, 'it', { numeric: true }));
  }, [cavallette, scelte]);
  const totale = riepilogo.reduce((n, g) => n + g.cavallette.length, 0);

  function alterna(id: string): void {
    setScelte((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function selezionaTutte(g: Gruppo): void {
    setScelte((s) => {
      const n = new Set(s);
      for (const c of g.cavallette) if (prontaDaConsegnare(c)) n.add(c.id);
      return n;
    });
  }
  function togliTutte(g: Gruppo): void {
    setScelte((s) => {
      const n = new Set(s);
      for (const c of g.cavallette) n.delete(c.id);
      return n;
    });
  }

  async function copia(): Promise<void> {
    const testo = riepilogo
      .map((g) => [`Commessa ${g.commessa}${g.cliente ? ` · ${g.cliente}` : ''}${g.indirizzo ? ` · ${g.indirizzo}` : ''}`, ...g.cavallette.map((c) => `${c.numero} (${nomeVetreria(c.vetreria)})`)].join('\n'))
      .join('\n\n');
    await navigator.clipboard.writeText(`Cavallette da consegnare (${totale})\n\n${testo}`);
    setCopiato(true);
    window.setTimeout(() => setCopiato(false), 2500);
  }

  return (
    <>
      <div className="no-stampa">
        <Titolo titolo="Cavallette da consegnare" sotto="Scrivi il numero di commessa: compaiono le cavallette abbinate. Spunta solo quelle che carichi sul mezzo." />
        {errore && <Messaggio tipo="errore">{errore}</Messaggio>}

        <label className="form">
          Numero di commessa
          <input
            className="cerca-grande"
            type="search"
            inputMode="text"
            autoFocus
            autoComplete="off"
            placeholder="es. 26031"
            value={cerca}
            onChange={(e) => setCerca(e.target.value)}
          />
        </label>

        {!cerca.trim() && <p className="vuoto">Inserisci un numero di commessa per vedere le sue cavallette.</p>}
        {cerca.trim() && gruppi.length === 0 && (
          <p className="vuoto">
            Nessuna cavalletta abbinata a «{cerca.trim()}». Controlla il numero: in Smartsheet la cavalletta deve avere il numero scritto in «N° CAVALLETTE» e la spunta «IMBALLAGGIO», e il file deve essere stato caricato.
          </p>
        )}

        {gruppi.map((g) => {
          const pronte = g.cavallette.filter(prontaDaConsegnare);
          const scelteQui = g.cavallette.filter((c) => scelte.has(c.id)).length;
          return (
            <section key={g.commessa} className="card gruppo-commessa">
              <div className="riga-spazio">
                <div>
                  <h2>Commessa {g.commessa}</h2>
                  <p className="sotto">{[g.cliente, g.indirizzo].filter(Boolean).join(' · ')}</p>
                </div>
                {pronte.length > 0 && (
                  <div className="riga-bottoni">
                    <button className="btn" onClick={() => selezionaTutte(g)}>Seleziona tutte ({pronte.length})</button>
                    <button className="btn" disabled={scelteQui === 0} onClick={() => togliTutte(g)}>Nessuna</button>
                  </div>
                )}
              </div>
              <ul className="spunte larghe">
                {g.cavallette.map((c) => {
                  const pronta = prontaDaConsegnare(c);
                  const spuntata = scelte.has(c.id);
                  return (
                    <li key={c.id}>
                      <label className={`spunta ${spuntata ? 'attiva' : ''} ${pronta ? '' : 'disattiva'}`}>
                        <input type="checkbox" checked={spuntata} disabled={!pronta} onChange={() => alterna(c.id)} />
                        <span className="numero">{c.numero}</span>
                        <span className="nota">{nomeVetreria(c.vetreria)}</span>
                        {pronta ? (
                          <Badge tono="blu">In piazzale</Badge>
                        ) : (
                          <Badge tono="grigio">Già dal cliente{c.data_consegna ? ` dal ${formattaData(c.data_consegna)}` : ''}</Badge>
                        )}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}

        {totale > 0 && (
          <div className="barra-riepilogo">
            <div>
              <strong>{totale} {totale === 1 ? 'cavalletta' : 'cavallette'} da caricare</strong>
              <div className="sotto">{riepilogo.map((g) => `${g.commessa}: ${g.cavallette.map((c) => c.numero).join(', ')}`).join(' · ')}</div>
            </div>
            <div className="riga-bottoni">
              <button className="btn" onClick={() => void copia()}>{copiato ? 'Copiato!' : 'Copia elenco'}</button>
              <button className="btn btn-primary" onClick={() => window.print()}>Stampa</button>
              <button className="btn" onClick={() => setScelte(new Set())}>Svuota</button>
            </div>
          </div>
        )}
      </div>

      {/* foglio che esce solo in stampa */}
      <div className="solo-stampa">
        <h1>Cavallette da consegnare</h1>
        <p>{formattaData(oggi)} · {totale} {totale === 1 ? 'cavalletta' : 'cavallette'}</p>
        {riepilogo.map((g) => (
          <div key={g.commessa} className="stampa-commessa">
            <h2>Commessa {g.commessa}</h2>
            <p>{[g.cliente, g.indirizzo].filter(Boolean).join(' · ')}</p>
            <ul>
              {g.cavallette.map((c) => (
                <li key={c.id}>☐ <strong>{c.numero}</strong> — {nomeVetreria(c.vetreria)}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
}
