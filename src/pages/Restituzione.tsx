import { useMemo, useState } from 'react';
import { restituisci } from '../lib/api.ts';
import { confrontaNumeri } from '../lib/keys.ts';
import { etichettaLuogo, etichettaStato } from '../lib/logica.ts';
import { useDati } from '../lib/dati.tsx';
import { Messaggio, Titolo } from '../components/ui.tsx';

// Schermata del magazziniere: prima la vetreria, poi le cavallette vuote in piazzale da riportare.
// Le altre cavallette della vetreria (non vuote o dal cliente) si vedono, ma non si possono spuntare.
export default function Restituzione() {
  const { cavallette, vetrerie, nomeVetreria, ricarica, caricamento, errore: erroreCaricamento } = useDati();
  const [scelta, setScelta] = useState<string | null>(null);
  const [spuntate, setSpuntate] = useState<Set<string>>(new Set());
  const [occupato, setOccupato] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [esito, setEsito] = useState<string | null>(null);

  const fornitori = useMemo(() => vetrerie.filter((v) => v.restituibile), [vetrerie]);

  // tutte le cavallette (non restituite) delle vetrerie da restituire
  const dellaVetreria = useMemo(() => {
    const m = new Map<string, typeof cavallette>();
    for (const c of cavallette) if (!c.restituita && fornitori.some((v) => v.codice === c.vetreria)) m.set(c.vetreria, [...(m.get(c.vetreria) ?? []), c]);
    return m;
  }, [cavallette, fornitori]);

  const pronta = (c: (typeof cavallette)[number]): boolean => c.stato === 'vuota' && c.luogo === 'piazzale';

  const lista = useMemo(
    () => (scelta ? (dellaVetreria.get(scelta) ?? []).filter(pronta).sort((a, b) => confrontaNumeri(a.numero, b.numero)) : []),
    [dellaVetreria, scelta],
  );
  const altre = useMemo(
    () => (scelta ? (dellaVetreria.get(scelta) ?? []).filter((c) => !pronta(c)).sort((a, b) => confrontaNumeri(a.numero, b.numero)) : []),
    [dellaVetreria, scelta],
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
        <div className="grande-lista">
          {fornitori.map((v) => {
            const pronte = (dellaVetreria.get(v.codice) ?? []).filter(pronta).length;
            return (
              <button key={v.codice} className="btn btn-big btn-vetreria" onClick={() => { setScelta(v.codice); setSpuntate(new Set()); setEsito(null); }}>
                <span>{v.nome}</span>
                <span className="stat-n">{pronte}</span>
              </button>
            );
          })}
        </div>
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
          {lista.length === 0 && (
            <p className="vuoto">Nessuna cavalletta vuota di {nomeVetreria(scelta)} da restituire adesso. Una cavalletta diventa restituibile quando è in piazzale e vuota (dopo il «DDT RIENTRO» di Smartsheet).</p>
          )}
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
          {altre.length > 0 && (
            <>
              <h3>Non ancora restituibili</h3>
              <ul className="spunte">
                {altre.map((c) => (
                  <li key={c.id}>
                    <label className="spunta disattiva" title="Non è vuota in piazzale">
                      <input type="checkbox" disabled />
                      <span className="numero">{c.numero}</span>
                      <span className="nota">{etichettaStato(c, false)} · {etichettaLuogo(c)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
          <button className="btn btn-primary btn-big invia" disabled={spuntate.size === 0 || occupato} onClick={() => void invia()}>
            {occupato ? 'Invio…' : `Invia (${spuntate.size})`}
          </button>
        </>
      )}
    </>
  );
}
