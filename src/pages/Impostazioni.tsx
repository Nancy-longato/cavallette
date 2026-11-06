import { useState } from 'react';
import { aggiungiChiusura, eliminaChiusura, salvaSoglia } from '../lib/api.ts';
import { formattaData } from '../lib/dates.ts';
import { useDati } from '../lib/dati.tsx';
import { Messaggio, Titolo } from '../components/ui.tsx';

export default function Impostazioni() {
  const { soglia, chiusure, ricarica } = useDati();
  const [giorni, setGiorni] = useState(String(soglia));
  const [data, setData] = useState('');
  const [descr, setDescr] = useState('');
  const [errore, setErrore] = useState<string | null>(null);
  const [esito, setEsito] = useState<string | null>(null);

  async function esegui(f: () => Promise<void>, ok: string): Promise<void> {
    setErrore(null);
    setEsito(null);
    try {
      await f();
      await ricarica();
      setEsito(ok);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore');
    }
  }

  const n = Number(giorni);
  return (
    <>
      <Titolo titolo="Impostazioni" />
      {errore && <Messaggio tipo="errore">{errore}</Messaggio>}
      {esito && <Messaggio tipo="ok">{esito}</Messaggio>}

      <div className="card form">
        <h2>Segnalazione di ritiro</h2>
        <label>Giorni lavorativi dopo la consegna al cliente
          <input type="number" min={1} max={90} value={giorni} onChange={(e) => setGiorni(e.target.value)} />
        </label>
        <div className="riga-bottoni">
          <button className="btn btn-primary" disabled={!Number.isInteger(n) || n < 1 || n > 90} onClick={() => void esegui(() => salvaSoglia(n), 'Soglia salvata.')}>Salva</button>
        </div>
        <p className="nota">Sabati, domeniche e festività nazionali non contano. Qui sotto aggiungi le chiusure aziendali (es. ferie d'agosto, patrono).</p>
      </div>

      <div className="card form">
        <h2>Chiusure aziendali</h2>
        <div className="toolbar">
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          <input className="cerca" placeholder="Descrizione (facoltativa)" value={descr} onChange={(e) => setDescr(e.target.value)} />
          <button className="btn btn-primary" disabled={!data} onClick={() => void esegui(async () => { await aggiungiChiusura(data, descr); setData(''); setDescr(''); }, 'Chiusura aggiunta.')}>Aggiungi</button>
        </div>
        {chiusure.size === 0 ? (
          <p className="nota">Nessuna chiusura inserita.</p>
        ) : (
          <div className="chip-lista">
            {[...chiusure].sort().map((d) => (
              <button key={d} className="chip" title="Clicca per eliminare" onClick={() => void esegui(() => eliminaChiusura(d), 'Chiusura eliminata.')}>{formattaData(d)} ✕</button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
