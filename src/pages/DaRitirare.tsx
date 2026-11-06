import { useMemo, useState } from 'react';
import { useDati } from '../lib/dati.tsx';
import { aggiungiGiorniLavorativi, formattaData } from '../lib/dates.ts';
import { daRitirare, giorniInCantiere } from '../lib/logica.ts';
import { Messaggio, Titolo } from '../components/ui.tsx';

export default function DaRitirare() {
  const { cavallette, oggi, chiusure, soglia, nomeVetreria, errore } = useDati();
  const [copiato, setCopiato] = useState(false);

  const righe = useMemo(
    () =>
      cavallette
        .filter((c) => daRitirare(c, oggi, chiusure, soglia))
        .map((c) => ({ c, giorni: giorniInCantiere(c, oggi, chiusure) ?? 0 }))
        .sort((a, b) => b.giorni - a.giorni),
    [cavallette, oggi, chiusure, soglia],
  );

  // prossime in scadenza (ultimi 3 giorni lavorativi prima della soglia)
  const inArrivo = useMemo(
    () =>
      cavallette
        .filter((c) => c.luogo === 'cliente' && !daRitirare(c, oggi, chiusure, soglia))
        .map((c) => ({ c, giorni: giorniInCantiere(c, oggi, chiusure) ?? 0 }))
        .filter((x) => x.giorni >= soglia - 3)
        .sort((a, b) => b.giorni - a.giorni),
    [cavallette, oggi, chiusure, soglia],
  );

  async function copia(): Promise<void> {
    const testo = righe
      .map(({ c }) => [c.numero, nomeVetreria(c.vetreria), c.cliente ?? '', c.indirizzo ?? '', c.commessa ?? ''].join(' | '))
      .join('\n');
    await navigator.clipboard.writeText(testo);
    setCopiato(true);
    window.setTimeout(() => setCopiato(false), 2500);
  }

  return (
    <>
      <Titolo
        titolo="Cavallette da ritirare"
        sotto={`Dal cliente da almeno ${soglia} giorni lavorativi: presumibilmente vuote, si può organizzare il giro di recupero.`}
        azioni={righe.length > 0 && <button className="btn" onClick={() => void copia()}>{copiato ? 'Copiato!' : 'Copia elenco'}</button>}
      />
      {errore && <Messaggio tipo="errore">{errore}</Messaggio>}

      {righe.length === 0 ? (
        <p className="vuoto">Nessuna cavalletta da ritirare in questo momento.</p>
      ) : (
        <div className="scorri">
          <table className="tabella">
            <thead>
              <tr><th>N.</th><th>Vetreria</th><th>Cliente</th><th>Indirizzo</th><th>Commessa</th><th>Dal cliente da</th><th>Giorni lav.</th></tr>
            </thead>
            <tbody>
              {righe.map(({ c, giorni }) => (
                <tr key={c.id}>
                  <td className="numero">{c.numero}</td>
                  <td>{nomeVetreria(c.vetreria)}</td>
                  <td>{c.cliente}</td>
                  <td>{c.indirizzo}</td>
                  <td>{c.commessa}</td>
                  <td>{formattaData(c.data_consegna)}</td>
                  <td className="num"><strong>{giorni}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {inArrivo.length > 0 && (
        <>
          <h2>Presto da ritirare</h2>
          <div className="scorri">
            <table className="tabella">
              <thead>
                <tr><th>N.</th><th>Cliente</th><th>Indirizzo</th><th>Giorni lav.</th><th>Scatta il</th></tr>
              </thead>
              <tbody>
                {inArrivo.map(({ c, giorni }) => (
                  <tr key={c.id}>
                    <td className="numero">{c.numero}</td>
                    <td>{c.cliente}</td>
                    <td>{c.indirizzo}</td>
                    <td className="num">{giorni}</td>
                    <td>{c.data_consegna ? formattaData(aggiungiGiorniLavorativi(c.data_consegna, soglia, chiusure)) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
