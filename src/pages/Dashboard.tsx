import { useMemo, useState } from 'react';
import type { Cavalletta } from '../lib/types.ts';
import { LONGATO } from '../lib/types.ts';
import { daRitirare } from '../lib/logica.ts';
import { useDati } from '../lib/dati.tsx';
import { Link } from '../lib/router.tsx';
import CavallettaTable from '../components/CavallettaTable.tsx';
import CavallettaDialog from '../components/CavallettaDialog.tsx';
import { Messaggio, Titolo } from '../components/ui.tsx';

type Gruppo = 'tutte' | 'fornitori' | 'interne';
type Filtro = 'tutti' | 'vetri' | 'serramenti_piazzale' | 'cliente' | 'vuote' | 'da_ritirare';

export default function Dashboard() {
  const { cavallette, vetrerie, oggi, chiusure, soglia, nomeVetreria, caricamento, errore, anomalieAperte, ricarica } = useDati();
  const [gruppo, setGruppo] = useState<Gruppo>('tutte');
  const [filtro, setFiltro] = useState<Filtro>('tutti');
  const [vetreria, setVetreria] = useState('');
  const [cerca, setCerca] = useState('');
  const [aperta, setAperta] = useState<Cavalletta | null>(null);

  const allerta = (c: Cavalletta): boolean => daRitirare(c, oggi, chiusure, soglia);

  const base = useMemo(
    () => cavallette.filter((c) => gruppo === 'tutte' || (gruppo === 'interne') === (c.vetreria === LONGATO)),
    [cavallette, gruppo],
  );

  const passa = (c: Cavalletta, f: Filtro): boolean => {
    switch (f) {
      case 'tutti': return true;
      case 'vetri': return c.stato === 'piena_vetri';
      case 'serramenti_piazzale': return c.stato === 'piena_serramenti' && c.luogo === 'piazzale';
      case 'cliente': return c.luogo === 'cliente';
      case 'vuote': return c.stato === 'vuota' && c.luogo === 'piazzale';
      case 'da_ritirare': return allerta(c);
    }
  };

  const conta = (f: Filtro): number => base.filter((c) => passa(c, f)).length;

  const visibili = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return base.filter((c) => {
      if (!passa(c, filtro)) return false;
      if (vetreria && c.vetreria !== vetreria) return false;
      if (!q) return true;
      return [c.numero, c.commessa, c.cliente, c.indirizzo, c.contenuto].some((v) => (v ?? '').toLowerCase().includes(q));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, filtro, vetreria, cerca, oggi, chiusure, soglia]);

  const schede: { f: Filtro; titolo: string; classe?: string }[] = [
    { f: 'tutti', titolo: 'In sede / in giro' },
    { f: 'vetri', titolo: 'Piene di vetri' },
    { f: 'serramenti_piazzale', titolo: 'Serramenti in piazzale' },
    { f: 'cliente', titolo: 'Dal cliente' },
    { f: 'vuote', titolo: 'Vuote in piazzale' },
    { f: 'da_ritirare', titolo: 'Da ritirare', classe: 'allerta' },
  ];

  return (
    <>
      <Titolo
        titolo="Cruscotto cavallette"
        sotto="Situazione in tempo reale. Clicca una riga per vedere lo storico."
        azioni={<button className="btn" onClick={() => void ricarica()}>Aggiorna</button>}
      />
      {errore && <Messaggio tipo="errore">{errore}</Messaggio>}
      {anomalieAperte > 0 && (
        <Messaggio tipo="avviso">
          Ci sono <strong>{anomalieAperte}</strong> segnalazioni da controllare. <Link to="/segnalazioni">Vai alle segnalazioni</Link>
        </Messaggio>
      )}

      <div className="segmenti">
        {(['tutte', 'fornitori', 'interne'] as Gruppo[]).map((g) => (
          <button key={g} className={`segmento ${gruppo === g ? 'attivo' : ''}`} onClick={() => setGruppo(g)}>
            {g === 'tutte' ? 'Tutte' : g === 'fornitori' ? 'Dei fornitori' : 'Nostre (Longato)'}
          </button>
        ))}
      </div>

      <div className="stats">
        {schede.map((s) => (
          <button
            key={s.f}
            className={`stat ${filtro === s.f ? 'attivo' : ''} ${s.classe && conta(s.f) > 0 ? s.classe : ''}`}
            onClick={() => setFiltro(filtro === s.f ? 'tutti' : s.f)}
          >
            <span className="stat-n">{conta(s.f)}</span>
            <span className="stat-t">{s.titolo}</span>
          </button>
        ))}
      </div>

      <div className="toolbar">
        <input className="cerca" placeholder="Cerca numero, commessa, cliente, indirizzo…" value={cerca} onChange={(e) => setCerca(e.target.value)} />
        <select value={vetreria} onChange={(e) => setVetreria(e.target.value)}>
          <option value="">Tutte le vetrerie</option>
          {vetrerie.map((v) => (
            <option key={v.codice} value={v.codice}>{v.nome}</option>
          ))}
        </select>
        <span className="nota">{visibili.length} cavallette</span>
      </div>

      {caricamento ? (
        <p className="vuoto">Caricamento…</p>
      ) : (
        <CavallettaTable righe={visibili} oggi={oggi} chiusure={chiusure} soglia={soglia} nomeVetreria={nomeVetreria} onSeleziona={setAperta} />
      )}

      {aperta && (
        <CavallettaDialog
          key={aperta.id}
          cavalletta={aperta}
          onChiudi={() => setAperta(null)}
          onModificata={() => {
            setAperta(null);
            void ricarica();
          }}
        />
      )}
    </>
  );
}
