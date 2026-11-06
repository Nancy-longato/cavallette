import { useCallback, useEffect, useState } from 'react';
import type { Anomalia } from '../lib/types.ts';
import { caricaAnomalie, risolviAnomalia } from '../lib/api.ts';
import { useDati } from '../lib/dati.tsx';
import { Badge, Messaggio, Titolo, dataOra } from '../components/ui.tsx';

const TITOLI: Record<string, string> = {
  sconosciuta: 'Cavalletta non in anagrafica',
  gia_in_uso: 'Cavalletta già in uso su un\'altra commessa',
};

export default function Segnalazioni() {
  const { ricarica } = useDati();
  const [lista, setLista] = useState<Anomalia[] | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [mostraRisolte, setMostraRisolte] = useState(false);

  const carica = useCallback(async () => {
    try {
      setLista(await caricaAnomalie());
      setErrore(null);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore di caricamento');
    }
  }, []);
  useEffect(() => {
    void carica();
  }, [carica]);

  async function cambia(a: Anomalia, risolta: boolean): Promise<void> {
    try {
      await risolviAnomalia(a.id, risolta);
      await carica();
      await ricarica();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore');
    }
  }

  const visibili = (lista ?? []).filter((a) => mostraRisolte || !a.risolta);

  return (
    <>
      <Titolo
        titolo="Segnalazioni"
        sotto="Incongruenze trovate leggendo Smartsheet. Si chiudono da sole quando il dato torna coerente; puoi chiuderle anche a mano."
        azioni={
          <label className="check">
            <input type="checkbox" checked={mostraRisolte} onChange={(e) => setMostraRisolte(e.target.checked)} /> Mostra anche le risolte
          </label>
        }
      />
      {errore && <Messaggio tipo="errore">{errore}</Messaggio>}
      {lista === null ? (
        <p className="vuoto">Caricamento…</p>
      ) : visibili.length === 0 ? (
        <p className="vuoto">Nessuna segnalazione aperta.</p>
      ) : (
        <ul className="lista-card">
          {visibili.map((a) => (
            <li key={a.id} className={`card ${a.risolta ? 'risolta' : ''}`}>
              <div className="riga-spazio">
                <div>
                  <Badge tono={a.risolta ? 'verde' : 'giallo'}>{a.risolta ? 'Risolta' : TITOLI[a.tipo] ?? a.tipo}</Badge>
                  <strong className="numero"> {a.numero}</strong>
                  {a.commessa && <span className="sotto"> · commessa {a.commessa}</span>}
                </div>
                <button className="btn" onClick={() => void cambia(a, !a.risolta)}>{a.risolta ? 'Riapri' : 'Segna come risolta'}</button>
              </div>
              <p>{a.dettaglio}</p>
              <p className="sotto">Rilevata il {dataOra(a.creata_il)}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
