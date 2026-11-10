import { useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { applicaPiano, caricaAnomalie, caricaCavallette, caricaCicli } from '../lib/api.ts';
import { leggiXlsx } from '../lib/xlsxReader.ts';
import { leggiSmartsheet, pianificaImport } from '../lib/smartsheet.ts';
import type { LetturaSmartsheet, StatoImport } from '../lib/smartsheet.ts';
import { oggiRoma } from '../lib/dates.ts';
import { useDati } from '../lib/dati.tsx';
import { Badge, Messaggio, Titolo } from '../components/ui.tsx';

const NOME_AZIONE = { imballata: 'Imballata', consegnata: 'Consegnata al cliente', rientrata: 'Rientrata' } as const;

export default function ImportSmartsheet() {
  const { ricarica } = useDati();
  const [aperte, setAperte] = useState<Set<string>>(new Set());
  const [nomeFile, setNomeFile] = useState('');
  const [lettura, setLettura] = useState<LetturaSmartsheet | null>(null);
  const [stato, setStato] = useState<StatoImport | null>(null);
  const [dal, setDal] = useState('');
  const [occupato, setOccupato] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [esito, setEsito] = useState<string | null>(null);

  async function scegliFile(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErrore(null);
    setEsito(null);
    setOccupato(true);
    try {
      if (!file.name.toLowerCase().endsWith('.xlsx')) throw new Error('Carica il file Excel (.xlsx) esportato da Smartsheet.');
      const fogli = await leggiXlsx(await file.arrayBuffer());
      const l = leggiSmartsheet(fogli);
      const [cavallette, cicli, anomalie] = await Promise.all([caricaCavallette(), caricaCicli(), caricaAnomalie()]);
      setAperte(new Set(anomalie.filter((a) => !a.risolta).map((a) => `${a.tipo}|${a.numero}|${a.commessa ?? ''}`)));
      setNomeFile(file.name);
      setLettura(l);
      setStato({ cavallette, cicli });
    } catch (err) {
      setLettura(null);
      setStato(null);
      setErrore(err instanceof Error ? err.message : 'Impossibile leggere il file');
    } finally {
      setOccupato(false);
    }
  }

  const piano = useMemo(() => {
    if (!lettura || !stato || lettura.colonneMancanti.length > 0) return null;
    const p = pianificaImport(lettura.righe, stato, { oggi: oggiRoma(), dal: dal || null });
    // le segnalazioni già aperte non vanno riproposte come novità
    const anomalie = p.anomalie.filter((a) => !aperte.has(`${a.tipo}|${a.numero}|${a.commessa ?? ''}`));
    return { ...p, anomalie, riepilogo: { ...p.riepilogo, anomalie: anomalie.length } };
  }, [lettura, stato, dal, aperte]);

  const daFare = piano !== null && (piano.azioni.length > 0 || piano.cicli.length > 0 || piano.anomalie.length > 0 || piano.risolte.length > 0);

  async function applica(): Promise<void> {
    if (!piano) return;
    setOccupato(true);
    setErrore(null);
    try {
      await applicaPiano(piano);
      setEsito(
        `Fatto: ${piano.azioni.length} aggiornamenti alle cavallette` +
          (piano.anomalie.length ? `, ${piano.anomalie.length} nuove segnalazioni` : '') +
          '.',
      );
      setLettura(null);
      setStato(null);
      await ricarica();
    } catch (e) {
      setErrore(`${e instanceof Error ? e.message : 'Errore'} — puoi ripetere l'import: i passaggi già fatti non vengono duplicati.`);
    } finally {
      setOccupato(false);
    }
  }

  return (
    <>
      <Titolo titolo="Aggiorna da Smartsheet" sotto="Carica l'Excel scaricato da Smartsheet: vedrai cosa cambierebbe e confermi tu. Si può ripetere tutte le volte che vuoi." />
      {errore && <Messaggio tipo="errore">{errore}</Messaggio>}
      {esito && <Messaggio tipo="ok">{esito}</Messaggio>}

      <div className="card">
        <label className="file">
          <span className="btn btn-primary btn-big">{occupato && !piano ? 'Lettura in corso…' : 'Scegli il file Excel di Smartsheet'}</span>
          <input type="file" accept=".xlsx" onChange={(e) => void scegliFile(e)} disabled={occupato} hidden />
        </label>
      </div>

      {lettura && lettura.colonneMancanti.length > 0 && (
        <Messaggio tipo="errore">
          Nel foglio «{lettura.foglio || nomeFile}» mancano queste colonne: <strong>{lettura.colonneMancanti.join(', ')}</strong>. Controlla di aver esportato la tabella giusta e che le colonne non siano state rinominate.
        </Messaggio>
      )}

      {lettura && piano && (
        <div className="card">
          <h2>Anteprima</h2>
          <p className="sotto">Foglio «{lettura.foglio}» · {lettura.righe.length} commesse lette · {piano.riepilogo.righeConCavallette} con cavallette da considerare</p>

          {!lettura.haDataCons && (
            <Messaggio tipo="info">
              Nelle colonne «DATA CONS. RIENTRATO» e «DAT DDT RIENTRO CAVALLETTA» non ci sono date: i 10 giorni per il ritiro partono dal giorno in cui la spunta viene vista per la prima volta (il giorno in cui carichi il file).
            </Messaggio>
          )}
          {lettura.haDataCons && (
            <label className="form">Considera solo le commesse con data di consegna/rientro dal (utile al primo import, per saltare lo storico vecchio)
              <input type="date" value={dal} onChange={(e) => setDal(e.target.value)} />
            </label>
          )}

          <div className="stats stats-piccole">
            <div className="stat"><span className="stat-n">{piano.riepilogo.imballate}</span><span className="stat-t">Imballate</span></div>
            <div className="stat"><span className="stat-n">{piano.riepilogo.consegnate}</span><span className="stat-t">Dal cliente</span></div>
            <div className="stat"><span className="stat-n">{piano.riepilogo.rientrate}</span><span className="stat-t">Rientrate vuote</span></div>
            <div className="stat"><span className="stat-n">{piano.riepilogo.giaAggiornate}</span><span className="stat-t">Già aggiornate</span></div>
            <div className={`stat ${piano.riepilogo.anomalie ? 'allerta' : ''}`}><span className="stat-n">{piano.riepilogo.anomalie}</span><span className="stat-t">Segnalazioni</span></div>
          </div>

          {piano.anomalie.length > 0 && (
            <>
              <h3>Da controllare</h3>
              <ul className="lista-semplice">
                {piano.anomalie.map((a) => (
                  <li key={`${a.tipo}${a.numero}${a.commessa}`}><Badge tono="giallo">{a.numero}</Badge> {a.dettaglio}</li>
                ))}
              </ul>
            </>
          )}

          {piano.azioni.length > 0 && (
            <>
              <h3>Cosa cambia</h3>
              <div className="scorri">
                <table className="tabella">
                  <thead><tr><th>Cavalletta</th><th>Cosa</th><th>Commessa</th><th>Cliente</th></tr></thead>
                  <tbody>
                    {piano.azioni.map((a, i) => (
                      <tr key={`${a.cavallettaId}${i}`}>
                        <td className="numero">{a.numero}</td>
                        <td>{NOME_AZIONE[a.tipo]}</td>
                        <td>{a.commessa}</td>
                        <td>{a.cliente}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {!daFare && <p className="nota">Nessuna novità rispetto a quanto già registrato.</p>}
          <div className="riga-bottoni">
            <button className="btn btn-primary btn-big" disabled={!daFare || occupato} onClick={() => void applica()}>
              {occupato ? 'Applico…' : 'Conferma e applica'}
            </button>
            <button className="btn" onClick={() => { setLettura(null); setStato(null); }}>Annulla</button>
          </div>
        </div>
      )}
    </>
  );
}
