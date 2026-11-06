import { useMemo, useState } from 'react';
import { restituisci } from '../lib/api.ts';
import { confrontaNumeri } from '../lib/keys.ts';
import { useDati } from '../lib/dati.tsx';
import { Messaggio, Titolo } from '../components/ui.tsx';

// Schermata del magazziniere: solo le cavallette vuote, in piazzale, da restituire.
export default function Restituzione() {
  const { cavallette, vetrerie, nomeVetreria, ricarica, caricamento, errore: erroreCaricamento } = useDati();
  const [scelta, setScelta] = useState<string | null>(null);
  const [spuntate, setSpuntate] = useState<Set<string>>(new Set());
  const [occupato, setOccupato] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [esito, setEsito] = useState<string | null>(null);

  const restituibili = useMemo(() => {
    const codici = new Set(vetrerie.filter((v) => v.restituibile).map((v) => v.codice));
    return cavallette.filter((c) => c.stato === 'vuota' && c.luogo === 'piazzale' && codici.has(c.vetreria));
  }, [cavallette, vetrerie]);

  const perVetreria = useMemo(() => {
    const m = new Map<string, typeof restituibili>();
    for (const c of restituibili) m.set(c.vetreria, [...(m.get(c.vetreria) ?? []), c]);
    return m;
  }, [restituibili]);

  const lista = useMemo(
    () => (scelta ? [...(perVetreria.get(scelta) ?? [])].sort((a, b) => confrontaNumeri(a.numero, b.numero)) : []),
    [perVetreria, scelta],
  );

  function alterna(id: string): void {
    setSpuntate((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function invia(): Promise<void> {
    if (!scelta || spuntate.size === 0) return;
    const nome = nomeVetreria(scelta);
    if (!window.confirm(`Restituire ${spuntate.size} cavallette a ${nome}? Spariranno da questa schermata.`)) return;
    setOccupato(true);
    setErrore(null);
    try {
      await restituisci(scelta, [...spuntate]);
      setEsito(`Fatto: ${spuntate.size} cavallette restituite a ${nome}.`);
      setSpuntate(new Set());
      setScelta(null);
      await ricarica();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore durante l\'invio');
      await ricarica();
    } finally {
      setOccupato(false);
    }
  }

  return (
    <>
      <Titolo titolo="Cavallette da restituire" sotto="Scegli la vetreria, spunta le cavallette che stai riportando e premi Invia." />
      {erroreCaricamento && <Messaggio tipo="errore">{erroreCaricamento}</Messaggio>}
      {errore && <Messaggio tipo="errore">{errore}</Messaggio>}
      {esito && <Messaggio tipo="ok">{esito}</Messaggio>}

      {caricamento ? (
        <p className="vuoto">Caricamento…</p>
      ) : !scelta ? (
        perVetreria.size === 0 ? (
          <p className="vuoto">Nessuna cavalletta da restituire.</p>
        ) : (
          <div className="grande-lista">
            {vetrerie
              .filter((v) => perVetreria.has(v.codice))
              .map((v) => (
                <button key={v.codice} className="btn btn-big btn-vetreria" onClick={() => { setScelta(v.codice); setSpuntate(new Set()); setEsito(null); }}>
                  <span>{v.nome}</span>
                  <span className="stat-n">{perVetreria.get(v.codice)?.length}</span>
                </button>
              ))}
          </div>
        )
      ) : (
        <>
          <div className="riga-spazio">
            <h2>{nomeVetreria(scelta)}</h2>
            <button className="btn" onClick={() => setScelta(null)}>← Cambia vetreria</button>
          </div>
          <div className="riga-bottoni">
            <button className="btn" onClick={() => setSpuntate(new Set(lista.map((c) => c.id)))}>Seleziona tutte</button>
            <button className="btn" onClick={() => setSpuntate(new Set())}>Nessuna</button>
          </div>
          <ul className="spunte">
            {lista.map((c) => (
              <li key={c.id}>
                <label className={`spunta ${spuntate.has(c.id) ? 'attiva' : ''}`}>
                  <input type="checkbox" checked={spuntate.has(c.id)} onChange={() => alterna(c.id)} />
                  <span className="numero">{c.numero}</span>
                </label>
              </li>
            ))}
          </ul>
          <button className="btn btn-primary btn-big invia" disabled={spuntate.size === 0 || occupato} onClick={() => void invia()}>
            {occupato ? 'Invio…' : `Invia (${spuntate.size})`}
          </button>
        </>
      )}
    </>
  );
}
