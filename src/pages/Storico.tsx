import { useEffect, useMemo, useState } from 'react';
import { caricaRestituzioni } from '../lib/api.ts';
import type { Cavalletta, Restituzione } from '../lib/types.ts';
import { formattaData } from '../lib/dates.ts';
import { useDati } from '../lib/dati.tsx';
import CavallettaDialog from '../components/CavallettaDialog.tsx';
import { Messaggio, Titolo } from '../components/ui.tsx';

export default function Storico() {
  const { nomeVetreria } = useDati();
  const [dati, setDati] = useState<{ restituzione: Restituzione; cavallette: Cavalletta[] }[] | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [cerca, setCerca] = useState('');
  const [aperta, setAperta] = useState<Cavalletta | null>(null);

  useEffect(() => {
    caricaRestituzioni().then(setDati).catch((e: unknown) => setErrore(e instanceof Error ? e.message : 'Errore di caricamento'));
  }, []);

  const filtrati = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    if (!dati) return [];
    if (!q) return dati;
    return dati.filter((d) => nomeVetreria(d.restituzione.vetreria).toLowerCase().includes(q) || d.cavallette.some((c) => c.numero.toLowerCase().includes(q)));
  }, [dati, cerca, nomeVetreria]);

  return (
    <>
      <Titolo titolo="Storico restituzioni" sotto="Le cavallette restituite alle vetrerie. Non compaiono più nel cruscotto." />
      {errore && <Messaggio tipo="errore">{errore}</Messaggio>}
      <div className="toolbar">
        <input className="cerca" placeholder="Cerca vetreria o numero cavalletta…" value={cerca} onChange={(e) => setCerca(e.target.value)} />
      </div>
      {dati === null ? (
        <p className="vuoto">Caricamento…</p>
      ) : filtrati.length === 0 ? (
        <p className="vuoto">Nessuna restituzione trovata.</p>
      ) : (
        <ul className="lista-card">
          {filtrati.map(({ restituzione: r, cavallette }) => (
            <li key={r.id} className="card">
              <details>
                <summary>
                  <strong>{formattaData(r.data)}</strong> · {nomeVetreria(r.vetreria)} · {cavallette.length} cavallette
                </summary>
                <div className="chip-lista">
                  {cavallette.map((c) => (
                    <button key={c.id} className="chip" onClick={() => setAperta(c)}>{c.numero}</button>
                  ))}
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
      {aperta && <CavallettaDialog key={aperta.id} cavalletta={aperta} onChiudi={() => setAperta(null)} onModificata={() => setAperta(null)} />}
    </>
  );
}
